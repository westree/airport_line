import { Router, IRequest } from 'itty-router';

// Define the environment variables
export interface Env {
    
    LINE_TOKEN: string;
    LINE_USER_ID: string;
    STATIC_ASSETS: KVNamespace; // Add KV Namespace binding
}

// Define the structure of the flight information from the ODPT API
interface HanedaFlightInfo {
    "航空会社": Array<{
        "ＡＬコード": string;
        "ＡＬ和名称": string;
        "ＡＬ英名称": string;
        "便名": string;
    }>;
    "出発地空港コード": string;
    "出発地空港和名称": string;
    "出発地空港英名称": string;
    "定刻": string;
    "状況": string;
    "変更時刻": string;
    "ターミナル区分": string;
    "ウイング区分": string;
    "出口": string;
    "STA": string; // Scheduled Time of Arrival
    "ETA": string; // Estimated Time of Arrival
    "ATA": string; // Actual Time of Arrival
}

// Define the structure of the flight information from the Haneda API
interface HanedaFlightInfo {
    "航空会社": Array<{
        "ＡＬコード": string;
        "ＡＬ和名称": string;
        "ＡＬ英名称": string;
        "便名": string;
    }>;
    "出発地空港コード": string;
    "出発地空港和名称": string;
    "出発地空港英名称": string;
    "定刻": string;
    "状況": string;
    "変更時刻": string;
    "ターミナル区分": string;
    "ウイング区分": string;
    "出口": string;
    "STA": string; // Scheduled Time of Arrival
    "ETA": string; // Estimated Time of Arrival
    "ATA": string; // Actual Time of Arrival
}

// Function to parse date and time strings from the Haneda API
const parseDateTime = (dateTimeStr: string | null, now: Date): Date | null => {
    if (!dateTimeStr) return null;

    let year, month, day, hours, minutes;

    if (dateTimeStr.includes('/')) { // YYYY/MM/DD HH:MM:SS format (e.g., "2025/07/30 07:50:00")
        const [datePart, timePart] = dateTimeStr.split(' ');
        const [y, m, d] = datePart.split('/').map(Number);
        const [h, min] = timePart.split(':').map(Number);
        year = y;
        month = m - 1; // Month is 0-indexed in JavaScript Date
        day = d;
        hours = h;
        minutes = min;
    } else if (dateTimeStr.length === 12) { // YYYYMMDDHHMM format (e.g., "202507300750")
        year = parseInt(dateTimeStr.substring(0, 4));
        month = parseInt(dateTimeStr.substring(4, 6)) - 1;
        day = parseInt(dateTimeStr.substring(6, 8));
        hours = parseInt(dateTimeStr.substring(8, 10));
        minutes = parseInt(dateTimeStr.substring(10, 12));
    } else {
        return null; // Unknown format
    }

    // Create a Date object in JST (UTC+9)
    let targetDate = new Date(Date.UTC(year, month, day, hours - 9, minutes, 0, 0));

    // If the targetDate (which is now in UTC, representing JST time) is in the past relative to 'now' (UTC),
    // it's likely meant for the next day. So, advance targetDate by one day.
    // This logic is crucial for handling flights that depart late at night and arrive the next day.
    if (targetDate.getTime() < now.getTime() - (24 * 60 * 60 * 1000) && (hours >= 0 && hours < 9)) { // If it's more than 24 hours in the past and in the early morning JST
        targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }

    return targetDate;
};

const router = Router();

// --- New function to get filtered and sorted flights ---
async function getFilteredAndSortedFlights(): Promise<any[]> {
    const flights = await fetchFlightInformation();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const processedFlights = flights.map(flight => {
        const scheduledTime = flight["定刻"];
        const actualTime = flight["変更時刻"] || flight["ATA"] || flight["ETA"]; // Use 変更時刻, then ATA, then ETA
        const flightOperator = flight["航空会社"][0]["ＡＬ和名称"];
        const flightNumber = flight["航空会社"][0]["便名"];
        const terminal = flight["ターミナル区分"];
        const wing = flight["ウイング区分"];
        const exit = flight["出口"];

        let formattedTerminal = `T${terminal}`;
        if (terminal === "1") {
            formattedTerminal += (wing === "N" ? " NorthWing" : (wing === "S" ? " SouthWing" : ""));
        } else if (terminal === "2") {
            formattedTerminal += (wing === "N" ? " NorthWing" : (wing === "S" ? " SouthWing" : ""));
        }

        return {
            airline: flightOperator,
            flightNumber: flightNumber,
            scheduledTime: scheduledTime ? scheduledTime.substring(scheduledTime.indexOf(' ') + 1, scheduledTime.lastIndexOf(':')) : 'N/A',
            actualTime: actualTime ? actualTime.substring(actualTime.indexOf(' ') + 1, actualTime.lastIndexOf(':')) : '',
            terminal: formattedTerminal,
            exit: exit,
            actualDateTime: parseDateTime(actualTime, now),
            scheduledDateTime: parseDateTime(scheduledTime, now)
        };
    }).filter(flight => flight.terminal !== "T3"); // Filter out international flights (Terminal 3)

    const filteredFlights = processedFlights.filter(flight => {
        const targetTime = flight.actualDateTime || flight.scheduledDateTime;
        return targetTime && targetTime >= oneHourAgo && targetTime <= twoHoursLater;
    });

    const sortedFlights = filteredFlights.sort((a, b) => {
        const timeA = (a.actualDateTime || a.scheduledDateTime)?.getTime() || 0;
        const timeB = (b.actualDateTime || b.scheduledDateTime)?.getTime() || 0;
        return timeA - timeB; // Sort ascending
    });

    // Take the top 5 flights for display
    const displayFlights = sortedFlights.slice(0, 5);

    return displayFlights;
}

// Handle incoming webhooks from LINE
router.post('/webhook', async (request: IRequest, env: Env) => {
    const body = await request.json();
    const events = body.events;

    if (events && events.length > 0) {
        const event = events[0];
        if (event.type === 'message' && event.message.text === '到着状況') {
            // Reuse the logic to get filtered flights
            const displayFlights = await getFilteredAndSortedFlights();
            const ttcInfo = await fetchTTCInfo(); // Fetch TTC info

            const messagesToSend: { type: string; text: string; }[] = [];

            if (ttcInfo !== "") {
                messagesToSend.push({ type: 'text', text: `[タクシー待機所情報]\n${ttcInfo}` });
            }

            if (displayFlights.length > 0) {
                const flightMessage = displayFlights
                    .map(flight => {
                        let timeInfo = `予定: ${flight.scheduledTime}`;
                        if (flight.actualTime && flight.actualTime !== flight.scheduledTime) {
                            timeInfo += ` / 実際: ${flight.actualTime}`;
                        }
                        return `[${flight.airline}] [${flight.flightNumber}]\n${timeInfo}\nターミナル: ${flight.terminal}\n出口: ${flight.exit}`;
                    })
                    .join('\n\n');
                messagesToSend.push({ type: 'text', text: `[フライト到着状況]\n${flightMessage}` });
            }

            if (messagesToSend.length > 0) {
                await sendLineReply(event.replyToken, messagesToSend, env);
            } else {
                await sendLineReply(event.replyToken, [{ type: 'text', text: "現在、表示できる情報がありません。" }], env);
            }
        }
    }

    return new Response('OK');
});

// --- New API endpoint for web interface ---
router.get('/api/arrivals', async (request: IRequest, env: Env) => {
    try {
        const flights = await getFilteredAndSortedFlights();
        return new Response(JSON.stringify(flights), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error("Error fetching flights for API:", error);
        return new Response(JSON.stringify({ error: "Failed to fetch flight data." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

// Send a reply message to LINE
async function sendLineReply(replyToken: string, messages: { type: string; text: string; }[], env: Env) {
    await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.LINE_TOKEN}`,
        },
        body: JSON.stringify({
            replyToken,
            messages: messages,
        }),
    });
}

// Fetch flight information from the Haneda API
async function fetchFlightInformation(): Promise<HanedaFlightInfo[]> {
    const response = await fetch("https://tokyo-haneda.com/app_resource/flight/data/dms/hdacfarv_v2.json");
    if (!response.ok) {
        console.error('Failed to fetch flight information from Haneda API:', await response.text());
        return [];
    }
    const data = await response.json();
    return data.flight_info as HanedaFlightInfo[];
}

// Function to fetch and parse TTC info
async function fetchTTCInfo(): Promise<string> {
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

// Export the Worker handlers
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // Handle static file requests from KV
        if (url.pathname === '/' || url.pathname === '/index.html') {
            console.log("Attempting to get index.html from STATIC_ASSETS. env.STATIC_ASSETS:", env.STATIC_ASSETS);
            const html = await env.STATIC_ASSETS.get('index.html', { type: 'text' });
            return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        } else if (url.pathname === '/style.css') {
            const css = await env.STATIC_ASSETS.get('style.css', { type: 'text' });
            return new Response(css, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
        } else if (url.pathname === '/script.js') {
            const js = await env.STATIC_ASSETS.get('script.js', { type: 'text' });
            return new Response(js, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
        } else if (url.pathname === '/favicon.ico') {
            return new Response(null, { status: 204 });
        }

        // Handle API and webhook routes
        const response = await router.handle(request, env);
        if (response) {
            return response;
        }

        // Fallback for any unhandled routes
        return new Response("Not Found", { status: 404 });
    },
};