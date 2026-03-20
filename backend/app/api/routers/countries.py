from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import datetime, timedelta, timezone
import logging
import re
from types import SimpleNamespace
from typing import Dict, List

import requests
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_llm_router
from app.config import get_settings
from app.connectors import fetch_emdat_events, fetch_gdelt_news, fetch_news_rss, fetch_reliefweb_events, fetch_world_bank_metrics
from app.connectors.base import ConnectorMetadata, ConnectorResult
from app.country_filters import EXCLUDED_COUNTRY_ISO3
from app.llm_router.models import InsightRequest
from app.llm_router.router import LLMRouter
from app.locations import list_locations
from app.schemas import (
    CountriesCatalogResponse,
    CountryCatalogItem,
    CountryCitiesResponse,
    CountryHistoricalSummary,
    CountryInsight,
    CountryMacroMetric,
    CountryNarrativeBlock,
    CountryProfileResponse,
    CountryResilienceDimension,
    CountryResilienceScorecard,
    CountrySignalItem,
    CountrySignalSummary,
    CountrySignalTimelinePoint,
    CountryThreatCount,
    InsightContent,
    SourceAttribution,
)

router = APIRouter(prefix="/countries", tags=["countries"])
logger = logging.getLogger(__name__)

COUNTRY_CACHE_TTL_HOURS = 24
COUNTRY_META_CACHE: Dict[str, tuple[datetime, dict]] = {}
COUNTRY_INDEX_CACHE: tuple[datetime, dict[str, dict]] | None = None
SOURCE_TRUST = {
    "reliefweb": 0.85,
    "gdelt": 0.74,
    "news_rss": 0.68,
    "emdat": 0.90,
    "world_bank": 0.88,
    "owid": 0.86,
}
MACRO_SOURCE_META = {
    "world_bank": {
        "source_url": "https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
        "license_tag": "World Bank Data API terms",
        "freshness_minutes": 10080,
    },
    "owid": {
        "source_url": "https://ourworldindata.org/co2-and-greenhouse-gas-emissions",
        "license_tag": "Our World in Data (CC BY 4.0)",
        "freshness_minutes": 10080,
    },
}
THREAT_KEYWORDS = {
    "flood": ["flood", "sel", "inundation"],
    "drought": ["drought", "kuraklik", "water stress"],
    "wildfire": ["wildfire", "fire", "yangin"],
    "heatwave": ["heatwave", "extreme heat", "sicak hava"],
    "storm": ["storm", "hurricane", "cyclone", "firtina"],
    "air_quality": ["smog", "pm2.5", "air quality", "hava kalitesi"],
}
CLIMATE_SIGNAL_KEYWORDS = (
    "climate",
    "heatwave",
    "flood",
    "drought",
    "wildfire",
    "storm",
    "hurricane",
    "cyclone",
    "sea level",
    "air quality",
    "pm2.5",
    "emission",
    "decarbon",
    "renewable",
    "sustainability",
    "temperature anomaly",
)
COUNTRY_DISAMBIGUATION_RULES = {
    "turkey": {
        "exclude_any": [
            "turkey gully",
            "wild turkey",
            "turkey vulture",
            "turkey creek",
            "thanksgiving turkey",
            "turkey trot",
        ],
        "require_any": ["turkiye", "türkiye", "turkish", "ankara", "istanbul", "izmir", "erdogan", "republic of turkey"],
    }
}
COUNTRY_CODE_OVERRIDES = {
    "turkiye": "TUR",
    "tuerkiye": "TUR",
    "turkey": "TUR",
    "united states": "USA",
    "usa": "USA",
    "u.s.a": "USA",
    "uk": "GBR",
    "united kingdom": "GBR",
}
SOURCE_FALLBACK_META = {
    "reliefweb": {
        "source_url": "https://apidoc.reliefweb.int/",
        "license_tag": "ReliefWeb API terms",
        "freshness_sla_minutes": 360,
    },
    "gdelt": {
        "source_url": "https://www.gdeltproject.org/",
        "license_tag": "GDELT terms",
        "freshness_sla_minutes": 180,
    },
    "news_rss": {
        "source_url": "https://news.google.com/",
        "license_tag": "Publisher terms via news RSS links",
        "freshness_sla_minutes": 180,
    },
    "emdat": {
        "source_url": "https://doc.emdat.be/docs/data-accessibility/",
        "license_tag": "EM-DAT licensed access",
        "freshness_sla_minutes": 10080,
    },
}


def _localized(lang: str, tr_text: str, en_text: str) -> str:
    return tr_text if lang == "tr" else en_text


def _normalize_country_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _choose_country_row(rows: list[dict], query: str, expected_iso2: str | None = None, expected_iso3: str | None = None) -> dict | None:
    best_row = None
    best_score = -10_000
    normalized_query = _normalize_country_token(query)
    for row in rows:
        if not isinstance(row, dict):
            continue
        row_iso2 = str(row.get("cca2") or "").upper()
        row_iso3 = str(row.get("cca3") or "").upper()
        common_name = str(row.get("name", {}).get("common") or "")
        official_name = str(row.get("name", {}).get("official") or "")
        normalized_common = _normalize_country_token(common_name)
        normalized_official = _normalize_country_token(official_name)

        if expected_iso2 and row_iso2 and row_iso2 != expected_iso2:
            continue
        if expected_iso3 and row_iso3 and row_iso3 != expected_iso3:
            continue

        score = 0
        if expected_iso2 and row_iso2 == expected_iso2:
            score += 5000
        if expected_iso3 and row_iso3 == expected_iso3:
            score += 5000
        if normalized_query:
            if normalized_query == normalized_common:
                score += 4000
            if normalized_query == normalized_official:
                score += 3500
            if normalized_common.startswith(normalized_query):
                score += 1800
            if normalized_query in normalized_common:
                score += 900
            if normalized_query in normalized_official:
                score += 700
            if len(normalized_query) >= 3 and normalized_query in _normalize_country_token(f"{row_iso2} {row_iso3}"):
                score += 600

        if score > best_score:
            best_score = score
            best_row = row

    return best_row


def _clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min_value, min(max_value, value))


def _norm(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return _clamp((value - low) / (high - low))


def _mean(values: List[float | None], fallback: float = 0.5) -> float:
    valid = [item for item in values if item is not None]
    if not valid:
        return fallback
    return float(sum(valid) / len(valid))


def _metric_value(macro_metrics: List[dict], indicator_id: str) -> float | None:
    for item in macro_metrics:
        if str(item.get("indicator_id")) != indicator_id:
            continue
        value = item.get("value")
        if value is None:
            return None
        try:
            return float(value)
        except Exception:
            return None
    return None


def _metric_delta(macro_metrics: List[dict], indicator_id: str) -> float | None:
    for item in macro_metrics:
        if str(item.get("indicator_id")) != indicator_id:
            continue
        value = item.get("delta_pct_vs_benchmark")
        if value is None:
            return None
        try:
            return float(value)
        except Exception:
            return None
    return None


def _metric_int(macro_metrics: List[dict], indicator_id: str) -> int | None:
    value = _metric_value(macro_metrics, indicator_id)
    if value is None:
        return None
    try:
        return int(round(value))
    except Exception:
        return None


def _fmt_metric(value: float | None, suffix: str = "", digits: int = 1) -> str:
    if value is None:
        return "-"
    return f"{value:.{digits}f}{suffix}"


def _build_resilience_scorecard(
    lang: str,
    signal_summary: CountrySignalSummary,
    historical_summary: CountryHistoricalSummary,
    macro_metrics: List[dict],
) -> CountryResilienceScorecard:
    co2_per_capita = _metric_value(macro_metrics, "EN.ATM.CO2E.PC")
    renewable_share = _metric_value(macro_metrics, "EG.FEC.RNEW.ZS")
    forest_share = _metric_value(macro_metrics, "AG.LND.FRST.ZS")
    population_density = _metric_value(macro_metrics, "EN.POP.DNST")
    gdp_per_capita = _metric_value(macro_metrics, "NY.GDP.PCAP.CD")
    electricity_access = _metric_value(macro_metrics, "EG.ELC.ACCS.ZS")

    transition_capacity = _mean(
        [
            _norm(renewable_share, 5, 70) if renewable_share is not None else None,
            (1 - _norm(co2_per_capita, 1, 16)) if co2_per_capita is not None else None,
            _norm(electricity_access, 80, 100) if electricity_access is not None else None,
        ]
    )
    ecosystem_buffer = _mean(
        [
            _norm(forest_share, 10, 65) if forest_share is not None else None,
            (1 - _norm(population_density, 50, 900)) if population_density is not None else None,
        ]
    )
    socioeconomic_capacity = _mean(
        [
            _norm(gdp_per_capita, 1500, 55000) if gdp_per_capita is not None else None,
            _norm(electricity_access, 75, 100) if electricity_access is not None else None,
        ]
    )

    trend_pressure = 0.35
    if historical_summary.trend_direction == "rising":
        trend_pressure = 0.65
    elif historical_summary.trend_direction == "falling":
        trend_pressure = 0.2

    climate_pressure = _clamp(
        (0.55 * (signal_summary.computed_risk_score / 100.0))
        + (0.25 * (_norm(population_density, 30, 700) if population_density is not None else 0.45))
        + (0.20 * trend_pressure)
    )

    adaptation_readiness = _clamp((0.40 * transition_capacity) + (0.25 * ecosystem_buffer) + (0.35 * socioeconomic_capacity))
    overall_resilience = _clamp((0.60 * adaptation_readiness) + (0.40 * (1 - climate_pressure)))

    dimensions = [
        CountryResilienceDimension(
            name=_localized(lang, "Enerji Donusum Kapasitesi", "Energy Transition Capacity"),
            score=round(transition_capacity * 100, 2),
            narrative=_localized(
                lang,
                "Yenilenebilir payi, kisi basi emisyon ve elektrige erisim gostergeleri birlikte degerlendirilir.",
                "Combines renewable share, per-capita emissions, and electricity access signals.",
            ),
        ),
        CountryResilienceDimension(
            name=_localized(lang, "Ekolojik Tampon", "Ecosystem Buffer"),
            score=round(ecosystem_buffer * 100, 2),
            narrative=_localized(
                lang,
                "Orman varligi ve yerlesim yogunlugu, ekosistem baskisini dengeleme kapasitesini etkiler.",
                "Forest cover and settlement density influence ecosystem shock-absorption potential.",
            ),
        ),
        CountryResilienceDimension(
            name=_localized(lang, "Sosyoekonomik Uyum", "Socioeconomic Adaptation Capacity"),
            score=round(socioeconomic_capacity * 100, 2),
            narrative=_localized(
                lang,
                "Gelir kapasitesi ve temel enerji erisimi, adaptasyon hizini dogrudan belirler.",
                "Income capacity and basic energy access directly shape adaptation speed.",
            ),
        ),
        CountryResilienceDimension(
            name=_localized(lang, "Iklim Baskisi", "Climate Pressure"),
            score=round(climate_pressure * 100, 2),
            narrative=_localized(
                lang,
                "Son sinyal yogunlugu, trend yonu ve maruziyet gostergeleri kisa vadeli operasyonel baskiyi olcer.",
                "Recent signal intensity, trend direction, and exposure markers measure near-term operational pressure.",
            ),
        ),
    ]

    narrative = _localized(
        lang,
        (
            f"Dayaniklilik skoru {overall_resilience * 100:.1f}/100 seviyesinde hesaplandi. "
            f"Adaptasyon hazirlik puani {adaptation_readiness * 100:.1f}, iklim baskisi ise {climate_pressure * 100:.1f} olarak izlendi."
        ),
        (
            f"Overall resilience is estimated at {overall_resilience * 100:.1f}/100. "
            f"Adaptation readiness is {adaptation_readiness * 100:.1f} while climate pressure is {climate_pressure * 100:.1f}."
        ),
    )

    return CountryResilienceScorecard(
        overall_resilience_score=round(overall_resilience * 100, 2),
        climate_pressure_score=round(climate_pressure * 100, 2),
        adaptation_readiness_score=round(adaptation_readiness * 100, 2),
        dimensions=dimensions,
        narrative=narrative,
    )


def _build_country_narrative(
    lang: str,
    country_name: str,
    signal_summary: CountrySignalSummary,
    historical_summary: CountryHistoricalSummary,
    scorecard: CountryResilienceScorecard | None,
    macro_metrics: List[dict],
) -> CountryNarrativeBlock:
    co2_per_capita = _metric_value(macro_metrics, "EN.ATM.CO2E.PC")
    renewable_share = _metric_value(macro_metrics, "EG.FEC.RNEW.ZS")
    forest_share = _metric_value(macro_metrics, "AG.LND.FRST.ZS")
    density = _metric_value(macro_metrics, "EN.POP.DNST")
    co2_delta = _metric_delta(macro_metrics, "EN.ATM.CO2E.PC")
    renewable_delta = _metric_delta(macro_metrics, "EG.FEC.RNEW.ZS")

    co2_delta_text = _localized(
        lang,
        "dunya ortalamasina yakin",
        "near the world average",
    )
    if co2_delta is not None:
        if co2_delta > 5:
            co2_delta_text = _localized(lang, "dunya ortalamasinin uzerinde", "above the world average")
        elif co2_delta < -5:
            co2_delta_text = _localized(lang, "dunya ortalamasinin altinda", "below the world average")

    renewable_delta_text = _localized(
        lang,
        "karsilastirma verisi sinirli",
        "benchmark coverage is limited",
    )
    if renewable_delta is not None:
        if renewable_delta > 5:
            renewable_delta_text = _localized(lang, "dunya ortalamasinin uzerinde", "above the world average")
        elif renewable_delta < -5:
            renewable_delta_text = _localized(lang, "dunya ortalamasinin altinda", "below the world average")
        else:
            renewable_delta_text = _localized(lang, "dunya ortalamasina yakin", "near the world average")

    if lang == "tr":
        executive_brief = (
            f"{country_name} icin risk skoru {signal_summary.computed_risk_score:.1f}/100 olarak izleniyor. "
            f"Son {signal_summary.lookback_days} gunde toplam {signal_summary.total_signals} iklim sinyali tespit edildi ve ana tehdit "
            f"{signal_summary.primary_threat.replace('_', ' ')} olarak one cikti."
        )
        climate_context = (
            f"Tarihsel trend {historical_summary.trend_direction} yonlu; son 7 gunde {historical_summary.recent_7d_signals} yeni sinyal birikti. "
            f"Bu tablo, kisa vadede operasyonel izleme frekansinin yuksek tutulmasini ve kritik altyapi alanlarinda sahaya donuk hazirlik planlarinin "
            "dinamik sekilde guncellenmesini gerektiriyor."
        )
        sustainability_context = (
            f"Kisi basi CO2 emisyonu {_fmt_metric(co2_per_capita, digits=2)} tCO2 ve bu seviye {co2_delta_text}. "
            f"Yenilenebilir enerji payi {_fmt_metric(renewable_share, '%', 1)} ile {renewable_delta_text}; "
            f"orman alani payi {_fmt_metric(forest_share, '%', 1)} ve nufus yogunlugu {_fmt_metric(density, ' kisi/km2', 1)}."
        )
        watch_items_30d = [
            "Yuksek siddetli olay sinyallerinde haftalik artis trendini izle.",
            "Sel/kuraklik benzeri ana tehdide ait saha raporlarini 24 saatlik pencerede dogrula.",
            "Enerji, su ve saglik altyapisinda kesinti on-gostergelerini izleme paneline bagla.",
            "Ulke bazli haber akisinda iklimle ilgisiz gurultuyu filtreleyip kaliteli kaynaklari agirliklandir.",
            "Veri tazelik SLA ihlallerini alarm kurallariyla otomatik isaretle.",
        ]
        action_tracks_90d = [
            "Yerel yonetimler icin 72 saatlik eylem planlarini il bazli kontrol listelerine dagit.",
            "Riskli bolgelerde adapasyon yatirimlarini su, enerji ve erken uyari altyapisina onceliklendir.",
            "Kamu-ozel sektor icin ortak veri odasi kurup kaynak atifli karar kayitlarini standartlastir.",
            "Okullar, hastaneler ve lojistik hatlari icin iklim dayaniklilik tatbikatlarini periyodiklestir.",
            "Politika etkisini olcmek icin 30/60/90 gunluk KPI setini yayinla ve aylik rapora bagla.",
        ]
    else:
        executive_brief = (
            f"{country_name} is currently monitored at a risk score of {signal_summary.computed_risk_score:.1f}/100. "
            f"The platform captured {signal_summary.total_signals} climate-linked signals over the last {signal_summary.lookback_days} days, "
            f"with {signal_summary.primary_threat.replace('_', ' ')} emerging as the primary threat."
        )
        climate_context = (
            f"The historical trend is {historical_summary.trend_direction} with {historical_summary.recent_7d_signals} signals in the last 7 days. "
            "This pattern supports a high-frequency operational monitoring posture and iterative updates to preparedness plans in critical infrastructure domains."
        )
        sustainability_context = (
            f"CO2 emissions are {_fmt_metric(co2_per_capita, digits=2)} tCO2 per capita, which is {co2_delta_text}. "
            f"Renewable energy share is {_fmt_metric(renewable_share, '%', 1)} ({renewable_delta_text}); "
            f"forest area share is {_fmt_metric(forest_share, '%', 1)} and population density is {_fmt_metric(density, ' people/km2', 1)}."
        )
        watch_items_30d = [
            "Track weekly acceleration of high-severity climate signals.",
            "Validate field reports linked to the primary threat within a 24-hour cycle.",
            "Integrate outage leading-indicators for energy, water, and health services into live monitoring.",
            "Reduce country news noise by weighting trusted climate-relevant sources.",
            "Auto-alert on freshness SLA breaches across high-impact data streams.",
        ]
        action_tracks_90d = [
            "Operationalize 72-hour response playbooks for subnational authorities.",
            "Prioritize adaptation investments in water, energy, and early-warning infrastructure.",
            "Standardize source-attributed decision logs across public-private coordination rooms.",
            "Institutionalize resilience drills for schools, hospitals, and logistics corridors.",
            "Publish a 30/60/90-day KPI framework and attach monthly accountability reviews.",
        ]

    if scorecard:
        sustainability_context += " " + scorecard.narrative

    return CountryNarrativeBlock(
        executive_brief=executive_brief,
        climate_context=climate_context,
        sustainability_context=sustainability_context,
        watch_items_30d=watch_items_30d,
        action_tracks_90d=action_tracks_90d,
    )


def _as_aware_utc(value: datetime | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _empty_connector_result(source: str, detail: str = "connector_error") -> ConnectorResult:
    descriptor = SOURCE_FALLBACK_META.get(source, {})
    return ConnectorResult(
        metadata=ConnectorMetadata(
            source=source,
            source_url=str(descriptor.get("source_url") or ""),
            license_tag=str(descriptor.get("license_tag") or "mixed-source"),
            freshness_sla_minutes=int(descriptor.get("freshness_sla_minutes") or 360),
        ),
        observations=[],
        events=[],
        raw={"status": "error", "detail": detail},
    )


def _run_connector_safely(source: str, fetch_fn, *args, **kwargs) -> ConnectorResult:
    try:
        result = fetch_fn(*args, **kwargs)
    except Exception as exc:
        logger.exception("Connector failed for %s", source)
        return _empty_connector_result(source, detail=str(exc))

    if not isinstance(result, ConnectorResult):
        return _empty_connector_result(source, detail="invalid_connector_result")
    return result


def _collect_country_connector_results(country_name: str) -> List[ConnectorResult]:
    settings = get_settings()
    connector_specs = [
        ("reliefweb", fetch_reliefweb_events, (country_name,), {}),
        ("gdelt", fetch_gdelt_news, (country_name,), {}),
        ("news_rss", fetch_news_rss, (country_name,), {}),
        ("emdat", fetch_emdat_events, (country_name,), {}),
    ]
    timeout_seconds = max(6, int(settings.request_timeout_seconds) + 4)

    results: List[ConnectorResult] = []
    with ThreadPoolExecutor(max_workers=len(connector_specs)) as executor:
        futures = {
            source: executor.submit(_run_connector_safely, source, fetch_fn, *args, **kwargs)
            for source, fetch_fn, args, kwargs in connector_specs
        }
        for source, future in futures.items():
            try:
                results.append(future.result(timeout=timeout_seconds))
            except TimeoutError:
                logger.warning("Connector timed out for %s (country=%s)", source, country_name)
                results.append(_empty_connector_result(source, detail="timeout"))
            except Exception:
                logger.exception("Connector execution failed for %s (country=%s)", source, country_name)
                results.append(_empty_connector_result(source, detail="connector_execution_error"))

    return results


def _fallback_insight_content(lang: str, country_name: str, signal_summary: CountrySignalSummary, now: datetime) -> InsightContent:
    if lang == "tr":
        return InsightContent(
            summary=(
                f"{country_name} icin deterministik analiz modunda risk skoru {signal_summary.computed_risk_score:.1f}/100 "
                f"ve ana tehdit {signal_summary.primary_threat.replace('_', ' ')} olarak gorunuyor."
            ),
            risk_rationale=(
                "LLM gecici olarak kullanilamadigi icin olay yogunlugu, siddet dagilimi ve kaynak tazelik sinyalleri "
                "uzerinden kural tabanli ozet olusturuldu."
            ),
            recommendations=[
                "15 dakikalik veri dongusunu aktif tut ve ani sinyal artislarina alarm esigi tanimla.",
                "Yuksek riskli altyapilarda operasyonel kaynak planini 72 saatlik senaryoya gore guncelle.",
                "Kaynak atifli saha raporlarini gunluk yonetsel ozetle birlestir.",
            ],
            first_72h_action_plan=[
                "0-24 saat: kritik servisler icin kesinti toleransini yeniden hesapla.",
                "24-48 saat: yuksek maruziyetli bolgelerde hedefli bilgilendirme yap.",
                "48-72 saat: yeni sinyallerle risk skorunu tekrar kalibre et.",
            ],
            citations=[
                {
                    "source": "deterministic_fallback",
                    "source_url": "https://localhost/fallback",
                    "timestamp_utc": now,
                }
            ],
        )

    return InsightContent(
        summary=(
            f"Deterministic mode indicates a {signal_summary.computed_risk_score:.1f}/100 risk score for {country_name}, "
            f"with {signal_summary.primary_threat.replace('_', ' ')} as the primary threat."
        ),
        risk_rationale=(
            "LLM generation is temporarily unavailable, so the summary is produced from rule-based scoring using "
            "event intensity, severity distribution, and source freshness."
        ),
        recommendations=[
            "Keep the 15-minute ingestion loop active and tighten alert thresholds for abrupt signal spikes.",
            "Update 72-hour operational resource plans for exposed infrastructure sectors.",
            "Merge source-attributed field reports into a daily executive note.",
        ],
        first_72h_action_plan=[
            "0-24h: recalculate outage tolerance for critical services.",
            "24-48h: issue targeted guidance in high-exposure districts.",
            "48-72h: recalibrate risk score with newly observed signals.",
        ],
        citations=[
            {
                "source": "deterministic_fallback",
                "source_url": "https://localhost/fallback",
                "timestamp_utc": now,
            }
        ],
    )


def _extract_country_meta(country_code: str) -> dict:
    settings = get_settings()
    raw_country_code = country_code.strip()
    normalized_raw = raw_country_code.lower()
    key = COUNTRY_CODE_OVERRIDES.get(normalized_raw, raw_country_code).upper()
    if not key:
        raise HTTPException(status_code=400, detail="country_code is required")

    cached = COUNTRY_META_CACHE.get(key)
    now = datetime.now(timezone.utc)
    if cached and cached[0] > now:
        return cached[1]

    fields = "name,cca2,cca3,capital,population,area,region,latlng"
    candidate_urls: list[str] = []
    expected_iso3 = key if len(key) == 3 and key.isalnum() else None
    expected_iso2 = key if len(key) == 2 and key.isalnum() else None
    if expected_iso2 or expected_iso3:
        # For code-based requests, query alpha endpoint only to prevent accidental
        # country drift (e.g., ambiguous name search returning a different ISO).
        candidate_urls.append(f"https://restcountries.com/v3.1/alpha/{key}?fields={fields}")
    else:
        candidate_urls.append(f"https://restcountries.com/v3.1/name/{country_code.strip()}?fullText=true&fields={fields}")
        candidate_urls.append(f"https://restcountries.com/v3.1/name/{country_code.strip()}?fullText=false&fields={fields}")

    payload = None
    for url in candidate_urls:
        try:
            response = requests.get(url, timeout=settings.request_timeout_seconds)
            if response.status_code >= 400:
                continue
            data = response.json()
            rows = data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])
            if not rows:
                continue
            selected = _choose_country_row(
                rows,
                query=raw_country_code,
                expected_iso2=expected_iso2,
                expected_iso3=expected_iso3,
            )

            if selected:
                payload = selected
                break
        except Exception:
            continue

    if not payload:
        if expected_iso2 or expected_iso3:
            fallback_meta = {
                "country_name": key,
                "iso2": expected_iso2,
                "iso3": expected_iso3 or key,
                "region": None,
                "capital": None,
                "population": None,
                "area_km2": None,
                "lat": None,
                "lon": None,
            }
            COUNTRY_META_CACHE[key] = (now + timedelta(hours=3), fallback_meta)
            return fallback_meta
        raise HTTPException(status_code=404, detail=f"Country metadata not found for code={country_code}")

    latlng = payload.get("latlng") if isinstance(payload.get("latlng"), list) else []
    meta = {
        "country_name": str(payload.get("name", {}).get("common") or key),
        "iso2": str(payload.get("cca2")) if payload.get("cca2") else None,
        "iso3": str(payload.get("cca3") or key),
        "region": str(payload.get("region")) if payload.get("region") else None,
        "capital": str(payload.get("capital", [None])[0]) if payload.get("capital") else None,
        "population": int(payload.get("population")) if payload.get("population") is not None else None,
        "area_km2": float(payload.get("area")) if payload.get("area") is not None else None,
        "lat": float(latlng[0]) if len(latlng) >= 2 else None,
        "lon": float(latlng[1]) if len(latlng) >= 2 else None,
    }

    expires_at = now + timedelta(hours=COUNTRY_CACHE_TTL_HOURS)
    COUNTRY_META_CACHE[key] = (expires_at, meta)
    if meta["iso3"]:
        COUNTRY_META_CACHE[str(meta["iso3"]).upper()] = (expires_at, meta)
    if meta["iso2"]:
        COUNTRY_META_CACHE[str(meta["iso2"]).upper()] = (expires_at, meta)
    return meta


def _fetch_country_index() -> dict[str, dict]:
    global COUNTRY_INDEX_CACHE
    now = datetime.now(timezone.utc)
    if COUNTRY_INDEX_CACHE and COUNTRY_INDEX_CACHE[0] > now:
        return COUNTRY_INDEX_CACHE[1]

    settings = get_settings()
    index: dict[str, dict] = {}
    try:
        fields = "name,cca2,cca3"
        response = requests.get(
            f"https://restcountries.com/v3.1/all?fields={fields}",
            timeout=settings.request_timeout_seconds,
        )
        if response.status_code < 400:
            rows = response.json()
            if isinstance(rows, list):
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    iso2 = str(row.get("cca2") or "").upper()
                    iso3 = str(row.get("cca3") or "").upper()
                    country_name = str(row.get("name", {}).get("common") or iso3 or iso2)
                    if not iso2:
                        continue
                    index[iso2] = {
                        "iso2": iso2,
                        "iso3": iso3 or iso2,
                        "country_name": country_name,
                    }
    except Exception:
        index = {}

    COUNTRY_INDEX_CACHE = (now + timedelta(hours=COUNTRY_CACHE_TTL_HOURS), index)
    return index


@router.get("", response_model=CountriesCatalogResponse)
def get_countries() -> CountriesCatalogResponse:
    now = datetime.now(timezone.utc)
    country_counts: Dict[str, int] = {}
    country_sample_location: Dict[str, dict] = {}
    country_index = _fetch_country_index()
    for item in list_locations(core_only=False):
        iso2 = str(item.get("country") or "").upper()
        if not iso2:
            continue
        country_counts[iso2] = country_counts.get(iso2, 0) + 1
        country_sample_location.setdefault(iso2, item)

    rows: list[CountryCatalogItem] = []
    for iso2, city_count in country_counts.items():
        record = country_index.get(iso2)
        if record is None:
            try:
                meta = _extract_country_meta(iso2)
                record = {
                    "iso2": iso2,
                    "iso3": str(meta.get("iso3") or iso2).upper(),
                    "country_name": str(meta.get("country_name") or iso2),
                }
            except Exception:
                record = {
                    "iso2": iso2,
                    "iso3": iso2,
                    "country_name": str(country_sample_location[iso2].get("country") or iso2),
                }

        iso3 = str(record.get("iso3") or iso2).upper()
        if iso3 in EXCLUDED_COUNTRY_ISO3:
            continue
        rows.append(
            CountryCatalogItem(
                iso2=iso2,
                iso3=iso3,
                country_name=str(record.get("country_name") or iso3),
                city_count=city_count,
            )
        )

    rows.sort(key=lambda item: item.country_name.lower())
    return CountriesCatalogResponse(generated_at=now, items=rows)


@router.get("/{country_code}/cities", response_model=CountryCitiesResponse)
def get_country_cities(country_code: str) -> CountryCitiesResponse:
    meta = _extract_country_meta(country_code)
    iso2 = str(meta.get("iso2") or "").upper() or None
    iso3 = str(meta.get("iso3") or country_code).upper()
    if iso3 in EXCLUDED_COUNTRY_ISO3:
        raise HTTPException(status_code=404, detail="Country is excluded from world explorer due to geometry constraints")

    locations = [
        item
        for item in list_locations(core_only=False)
        if not iso2 or str(item.get("country") or "").upper() == iso2
    ]
    locations.sort(key=lambda item: str(item.get("name") or "").lower())
    return CountryCitiesResponse(
        generated_at=datetime.now(timezone.utc),
        iso2=iso2,
        iso3=iso3,
        country_name=str(meta.get("country_name") or iso3),
        items=locations,
    )


def _infer_primary_threat(events: List[dict]) -> str:
    scores = {key: 0 for key in THREAT_KEYWORDS}
    for event in events:
        text = f"{event.get('title', '')} {event.get('summary', '')}".lower()
        for threat, keywords in THREAT_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text:
                    scores[threat] += 1
    primary = max(scores, key=lambda key: scores[key])
    return primary if scores[primary] > 0 else "climate_stress"


def _build_signal_summary(events: List[dict], lookback_days: int, primary_threat: str) -> CountrySignalSummary:
    total = len(events)
    disaster = sum(1 for item in events if str(item.get("event_type")) == "disaster")
    news = sum(1 for item in events if str(item.get("event_type")) == "news_signal")
    high = sum(1 for item in events if str(item.get("severity", "")).lower() == "high")

    score = (total * 2.6) + (disaster * 1.6) + (high * 4.8) + 10.0
    if primary_threat in {"flood", "drought", "wildfire", "heatwave"}:
        score += 8.0
    score = max(0.0, min(100.0, score))

    return CountrySignalSummary(
        lookback_days=lookback_days,
        total_signals=total,
        disaster_signals=disaster,
        news_signals=news,
        high_severity_signals=high,
        primary_threat=primary_threat,
        computed_risk_score=round(score, 1),
    )


def _infer_event_threat(event: dict) -> str:
    text = f"{event.get('title', '')} {event.get('summary', '')}".lower()
    for threat, keywords in THREAT_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return threat
    return "climate_stress"


def _choose_bucket_days(lookback_days: int) -> int:
    if lookback_days <= 30:
        return 3
    if lookback_days <= 90:
        return 7
    if lookback_days <= 180:
        return 10
    return 14


def _compute_trend_direction(points: List[CountrySignalTimelinePoint]) -> str:
    if len(points) < 2:
        return "stable"
    midpoint = len(points) // 2
    first_half = points[:midpoint]
    second_half = points[midpoint:]
    first_avg = sum(item.signal_count for item in first_half) / len(first_half) if first_half else 0.0
    second_avg = sum(item.signal_count for item in second_half) / len(second_half) if second_half else 0.0

    if first_avg == 0 and second_avg > 0:
        return "rising"
    if first_avg == 0 and second_avg == 0:
        return "stable"
    if second_avg >= first_avg * 1.15:
        return "rising"
    if second_avg <= first_avg * 0.85:
        return "falling"
    return "stable"


def _build_historical_summary(events: List[dict], lookback_days: int, now: datetime) -> CountryHistoricalSummary:
    bucket_days = _choose_bucket_days(lookback_days)
    cutoff = now - timedelta(days=lookback_days)

    filtered_events = [event for event in events if event["occurred_at"] >= cutoff]
    timeline: List[CountrySignalTimelinePoint] = []
    cursor = cutoff
    while cursor < now:
        bucket_end = min(now, cursor + timedelta(days=bucket_days))
        bucket_events = [event for event in filtered_events if cursor <= event["occurred_at"] < bucket_end]
        timeline.append(
            CountrySignalTimelinePoint(
                bucket_start=cursor,
                bucket_end=bucket_end,
                signal_count=len(bucket_events),
                high_severity_count=sum(1 for item in bucket_events if str(item.get("severity", "")).lower() == "high"),
                disaster_count=sum(1 for item in bucket_events if str(item.get("event_type")) == "disaster"),
            )
        )
        cursor = bucket_end

    threat_counter = Counter(_infer_event_threat(item) for item in filtered_events)
    top_threats = [CountryThreatCount(threat=threat, count=count) for threat, count in threat_counter.most_common(6)]

    recent_7d_cutoff = now - timedelta(days=7)
    recent_7d_signals = sum(1 for item in filtered_events if item["occurred_at"] >= recent_7d_cutoff)

    return CountryHistoricalSummary(
        lookback_days=lookback_days,
        bucket_days=bucket_days,
        trend_direction=_compute_trend_direction(timeline),
        average_daily_signals=round(len(filtered_events) / float(lookback_days), 3),
        recent_7d_signals=recent_7d_signals,
        top_threats=top_threats,
        timeline=timeline,
    )


def _contains_word(text: str, token: str) -> bool:
    token = str(token or "").strip().lower()
    if not token:
        return False
    return re.search(rf"\b{re.escape(token)}\b", text) is not None


def _passes_country_disambiguation(
    country_name: str,
    title: str,
    summary: str,
    iso2: str | None = None,
    iso3: str | None = None,
    capital: str | None = None,
) -> bool:
    text = f"{title} {summary}".lower()
    normalized_country = str(country_name or "").strip().lower()
    if not normalized_country:
        return True

    rules = COUNTRY_DISAMBIGUATION_RULES.get(normalized_country)
    if not rules:
        return True

    mentions_country = _contains_word(text, normalized_country)
    mentions_iso = _contains_word(text, str(iso2 or "").lower()) or _contains_word(text, str(iso3 or "").lower())
    mentions_capital = _contains_word(text, str(capital or "").lower())
    if not (mentions_country or mentions_iso or mentions_capital):
        return False

    if any(token in text for token in rules.get("exclude_any", [])):
        return False
    if any(token in text for token in rules.get("require_any", [])):
        return True

    # For ambiguous country names, allow only if geopolitical context exists.
    geo_context_pattern = r"\b(country|government|ministry|parliament|president|summit|climate|energy|policy|republic|nation|sanctions)\b"
    directional_country_pattern = rf"\b(in|to|from|across|within|inside|outside|for)\s+{re.escape(normalized_country)}\b"
    possessive_country_pattern = rf"\b{re.escape(normalized_country)}['’]s\b"
    if re.search(geo_context_pattern, text) and (mentions_country or mentions_iso or mentions_capital):
        return True
    if re.search(directional_country_pattern, text) or re.search(possessive_country_pattern, text):
        return True
    return False


def _is_climate_relevant_event(source: str, title: str, summary: str, country_name: str, iso2: str | None, iso3: str | None, capital: str | None) -> bool:
    if source not in {"gdelt", "news_rss"}:
        return True
    text = f"{title} {summary}".lower()
    if not any(keyword in text for keyword in CLIMATE_SIGNAL_KEYWORDS):
        return False
    return _passes_country_disambiguation(country_name, title, summary, iso2=iso2, iso3=iso3, capital=capital)


@router.get("/{country_code}/profile", response_model=CountryProfileResponse)
def get_country_profile(
    country_code: str,
    lang: str = Query("tr", pattern="^(tr|en)$"),
    days: int = Query(30, ge=3, le=365),
    llm_router: LLMRouter = Depends(get_llm_router),
) -> CountryProfileResponse:
    meta = _extract_country_meta(country_code)
    if str(meta.get("iso3") or "").upper() in EXCLUDED_COUNTRY_ISO3:
        raise HTTPException(status_code=404, detail="Country is excluded from world explorer due to geometry constraints")
    country_name = meta["country_name"]

    connector_results = _collect_country_connector_results(country_name)

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    events: List[dict] = []
    source_attribution: List[SourceAttribution] = []

    for result in connector_results:
        source_attribution.append(
            SourceAttribution(
                source=result.metadata.source,
                source_url=result.metadata.source_url,
                timestamp_utc=now,
                license_tag=result.metadata.license_tag,
                freshness_minutes=result.metadata.freshness_sla_minutes,
                trust_score=SOURCE_TRUST.get(result.metadata.source),
            )
        )
        for raw_event in result.events:
            occurred_at = _as_aware_utc(raw_event.get("occurred_at"))
            if occurred_at < cutoff:
                continue
            title = str(raw_event.get("title", "Signal"))[:500]
            summary = str(raw_event.get("summary", ""))[:4000]
            if not _is_climate_relevant_event(
                result.metadata.source,
                title,
                summary,
                country_name=country_name,
                iso2=meta.get("iso2"),
                iso3=meta.get("iso3"),
                capital=meta.get("capital"),
            ):
                continue
            events.append(
                {
                    "source": result.metadata.source,
                    "event_type": str(raw_event.get("event_type", "signal")),
                    "severity": str(raw_event.get("severity", "medium")),
                    "title": title,
                    "summary": summary,
                    "occurred_at": occurred_at,
                    "source_url": str(raw_event.get("source_url") or result.metadata.source_url)[:500],
                }
            )

    events.sort(key=lambda item: item["occurred_at"], reverse=True)
    recent_events = events[:20]
    primary_threat = _infer_primary_threat(events)
    signal_summary = _build_signal_summary(events, lookback_days=days, primary_threat=primary_threat)
    historical_summary = _build_historical_summary(events, lookback_days=days, now=now)
    try:
        world_bank_metadata, macro_metrics = fetch_world_bank_metrics(str(meta["iso3"]))
    except Exception:
        logger.exception("World Bank metrics fetch failed for %s", meta.get("iso3"))
        world_bank_metadata = ConnectorMetadata(
            source="world_bank",
            source_url="https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
            license_tag="World Bank Data API terms",
            freshness_sla_minutes=10080,
        )
        macro_metrics = []
    if macro_metrics:
        # Prefer live macro indicators for population/area to keep profile values consistent across countries.
        population_live = _metric_int(macro_metrics, "SP.POP.TOTL")
        area_live = _metric_value(macro_metrics, "AG.SRF.TOTL.K2")
        baseline_population = int(meta["population"]) if meta.get("population") not in (None, 0) else None
        baseline_area = float(meta["area_km2"]) if meta.get("area_km2") not in (None, 0) else None

        population_trustworthy = True
        if baseline_population and population_live:
            ratio = population_live / float(baseline_population)
            population_trustworthy = 0.2 <= ratio <= 5.0
        if population_live is not None and population_live > 0 and population_trustworthy:
            meta["population"] = population_live

        area_trustworthy = True
        if baseline_area and area_live:
            ratio = area_live / float(baseline_area)
            area_trustworthy = 0.2 <= ratio <= 5.0
        if area_live is not None and area_live > 0 and area_trustworthy:
            meta["area_km2"] = round(area_live, 2)

        macro_sources = sorted({str(item.get("source") or "world_bank") for item in macro_metrics})
        existing_sources = {item.source for item in source_attribution}
        for macro_source in macro_sources:
            if macro_source in existing_sources:
                continue
            if macro_source == world_bank_metadata.source:
                source_url = world_bank_metadata.source_url
                license_tag = world_bank_metadata.license_tag
                freshness_minutes = world_bank_metadata.freshness_sla_minutes
            else:
                descriptor = MACRO_SOURCE_META.get(macro_source, {})
                source_url = str(descriptor.get("source_url") or world_bank_metadata.source_url)
                license_tag = str(descriptor.get("license_tag") or world_bank_metadata.license_tag)
                freshness_minutes = int(descriptor.get("freshness_minutes") or world_bank_metadata.freshness_sla_minutes)

            source_attribution.append(
                SourceAttribution(
                    source=macro_source,
                    source_url=source_url,
                    timestamp_utc=now,
                    license_tag=license_tag,
                    freshness_minutes=freshness_minutes,
                    trust_score=SOURCE_TRUST.get(macro_source),
                )
            )

    evidence = [
        {
            "source": item["source"],
            "source_url": item["source_url"],
            "title": item["title"],
            "summary": item["summary"],
            "timestamp_utc": item["occurred_at"].isoformat(),
        }
        for item in recent_events[:20]
    ]

    try:
        payload, decision = llm_router.generate_insight(
            InsightRequest(
                location_id=str(meta["iso3"]).lower(),
                location_name=country_name,
                lang=lang,
                risk_score=signal_summary.computed_risk_score,
                primary_threat=signal_summary.primary_threat,
                evidence=evidence,
            )
        )
        if hasattr(payload, "model_dump"):
            insight_content = InsightContent.model_validate(payload.model_dump(mode="json"))
        else:
            insight_content = InsightContent.model_validate(payload)
    except Exception:
        logger.exception("Country insight generation failed for %s", meta.get("iso3"))
        insight_content = _fallback_insight_content(lang, country_name, signal_summary, now)
        decision = SimpleNamespace(provider="fallback", model="deterministic-country-v1")

    scorecard = _build_resilience_scorecard(
        lang=lang,
        signal_summary=signal_summary,
        historical_summary=historical_summary,
        macro_metrics=macro_metrics,
    )
    narrative = _build_country_narrative(
        lang=lang,
        country_name=country_name,
        signal_summary=signal_summary,
        historical_summary=historical_summary,
        scorecard=scorecard,
        macro_metrics=macro_metrics,
    )

    return CountryProfileResponse(
        country_name=country_name,
        iso2=meta["iso2"],
        iso3=str(meta["iso3"]),
        region=meta["region"],
        capital=meta["capital"],
        population=meta["population"],
        area_km2=meta["area_km2"],
        lat=meta["lat"],
        lon=meta["lon"],
        generated_at=now,
        signal_summary=signal_summary,
        historical_summary=historical_summary,
        insight=CountryInsight(
            provider=decision.provider,
            model=decision.model,
            generated_at=now,
            content=insight_content,
        ),
        macro_metrics=[CountryMacroMetric.model_validate(item) for item in macro_metrics],
        resilience_scorecard=scorecard,
        narrative=narrative,
        recent_signals=[
            CountrySignalItem(
                source=item["source"],
                event_type=item["event_type"],
                severity=item["severity"],
                title=item["title"],
                summary=item["summary"],
                occurred_at=item["occurred_at"],
                source_url=item["source_url"],
            )
            for item in recent_events
        ],
        source_attribution=source_attribution,
        license_tag="mixed-source-non-commercial",
    )
