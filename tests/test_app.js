const { renderPage, escapeHtml } = require("../app/server");

describe("renderPage", () => {
  test("escapes malicious filename (XSS regression)", () => {
    const files = [
      { id: "abc123", name: '<script>alert(1)</script>', size: 42 },
    ];
    const html = renderPage(files);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  test("shows empty state when no files", () => {
    const html = renderPage([]);
    expect(html).toContain("No files yet");
  });

  test("lists a file with name, size, and download link", () => {
    const files = [
      { id: "xyz789", name: "report.pdf", size: 2048 },
    ];
    const html = renderPage(files);
    expect(html).toContain("report.pdf");
    expect(html).toContain("2,048 B");
    expect(html).toContain('/file/xyz789">Download</a>');
  });
});

describe("escapeHtml", () => {
  test("escapes all dangerous characters", () => {
    expect(escapeHtml('a<b>c&d"e\'f')).toBe(
      "a&lt;b&gt;c&amp;d&quot;e&#x27;f"
    );
  });
});
