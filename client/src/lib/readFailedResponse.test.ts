import { describe, expect, it } from "vitest";
import { readFailedResponseMessage } from "./readFailedResponse";

function response(status: number, body: string, contentType = "text/html"): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType },
  });
}

describe("readFailedResponseMessage", () => {
  it("reads JSON error and message fields", async () => {
    await expect(
      readFailedResponseMessage(
        response(400, JSON.stringify({ error: "No file provided" }), "application/json"),
        "Upload failed",
      ),
    ).resolves.toBe("No file provided");

    await expect(
      readFailedResponseMessage(
        response(500, JSON.stringify({ message: "File too large" }), "application/json"),
        "Upload failed",
      ),
    ).resolves.toBe("File too large");
  });

  it("turns an nginx HTML 413 page into a size message", async () => {
    const html = `<html>
<head><title>413 Request Entity Too Large</title></head>
<body><center><h1>413 Request Entity Too Large</h1></center></body>
</html>`;
    await expect(readFailedResponseMessage(response(413, html), "Upload failed")).resolves.toBe(
      "This file is too large for the site. Use a smaller file (100 MB or less).",
    );
  });

  it("does not throw on a gateway HTML page", async () => {
    const html = "<html>\n<head><title>502 Bad Gateway</title></head></html>";
    await expect(readFailedResponseMessage(response(502, html), "Upload failed")).resolves.toBe(
      "The upload did not finish. Try a smaller file, or try again in a moment.",
    );
  });
});
