export async function fetchTTCInfo(): Promise<string> {
    const response = await fetch("https://ttc.taxi-inf.jp/");

    if (!response.ok) {
        return "";
    }
    const text = await response.text();
    // Normalize newlines to avoid issues with indexOf
    const normalizedText = text.replace(/\r\n/g, '\n');

    // Extract the relevant part of the text
    const startIndex = normalizedText.indexOf("羽田空港TPシステム");
    const endIndex = normalizedText.indexOf("202", startIndex); // Find the first date string after the start

    if (startIndex !== -1 && endIndex !== -1) {
        let extractedText = normalizedText.substring(startIndex, endIndex).trim();
        // Clean up extra newlines and spaces
        extractedText = extractedText.replace(/\n\n+/g, "\n").replace(/\s\s+/g, " ");
        // Remove HTML-like tags
        extractedText = extractedText.replace(/<[^>]*>/g, '');
        return extractedText;
    } else if (startIndex !== -1) {
        // If end marker not found, take from start to a reasonable length or end of content
        let extractedText = normalizedText.substring(startIndex, startIndex + 1000).trim(); // Limit to 1000 chars for safety
        extractedText = extractedText.replace(/\n\n+/g, "\n").replace(/\s\s+/g, " ");
        // Remove HTML-like tags
        extractedText = extractedText.replace(/<[^>]*>/g, '');
        return extractedText;
    }
    return "";
}