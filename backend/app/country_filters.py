from __future__ import annotations

# Countries excluded from globe-driven interaction because their polygon
# geometry may trigger complement-fill artifacts in some 3D renderers.
EXCLUDED_COUNTRY_ISO3: set[str] = {"BMU"}
