from app.connectors.news_rss import fetch_news_rss


class _MockResponse:
    def __init__(self, status_code: int, text: str) -> None:
        self.status_code = status_code
        self.text = text


def test_news_rss_connector_parses_items(monkeypatch):
    xml = """
    <rss><channel>
      <item>
        <title>Flood emergency in test city</title>
        <link>https://example.com/news/1</link>
        <description><![CDATA[<a href="https://example.com/news/1">Climate related flood signal</a>]]></description>
        <pubDate>Tue, 18 Mar 2026 03:00:00 GMT</pubDate>
      </item>
    </channel></rss>
    """

    monkeypatch.setattr(
        "app.connectors.news_rss.requests.get",
        lambda *args, **kwargs: _MockResponse(200, xml),
    )

    result = fetch_news_rss("Turkey")
    assert result.metadata.source == "news_rss"
    assert len(result.events) == 1
    assert result.events[0]["event_type"] == "news_signal"
    assert result.events[0]["severity"] == "high"
    assert "<a" not in result.events[0]["summary"]
