import { Router, IRequest } from 'itty-router';

// Define the environment variables
export interface Env {
    ODPT_TOKEN: string;
    LINE_TOKEN: string;
    LINE_USER_ID: string;
    STATIC_ASSETS: KVNamespace; // Add KV Namespace binding
}

// Define the structure of the flight information from the ODPT API
interface FlightInformation {
    "owl:sameAs": string;
    "odpt:operator": string;
    "odpt:flightNumber": string[];
    "odpt:flightStatus": string | null;
    "odpt:scheduledArrivalTime": string;
    "odpt:actualArrivalTime": string | null;
    "odpt:arrivalAirport": string;
    "odpt:departureAirport": string;
    "odpt:arrivalAirportTerminal": string | null;
    "odpt:arrivalGate": string | null;
    "dc:date"?: string;
}

const getDateFromHHMM = (timeStr: string | null, dateStr: string | undefined, now: Date): Date | null => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);

    let baseDateUTC: Date;
    if (dateStr) {
        // Parse the ISO string. This will give a Date object representing that exact moment in time.
        baseDateUTC = new Date(dateStr);
    } else {
        // Get today's date in UTC (from the 'now' parameter which is UTC)
        baseDateUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }

    // Convert JST hours to UTC hours (JST is UTC+9)
    let targetHoursUTC = hours - 9;
    let targetMinutesUTC = minutes;

    // Handle cases where subtracting 9 hours goes to the previous day
    if (targetHoursUTC < 0) {
        targetHoursUTC += 24; // Add 24 hours to bring it to the current day's UTC equivalent
        baseDateUTC.setUTCDate(baseDateUTC.getUTCDate() - 1); // Go back one day in UTC
    }

    let targetDate = new Date(Date.UTC(
        baseDateUTC.getUTCFullYear(),
        baseDateUTC.getUTCMonth(),
        baseDateUTC.getUTCDate(),
        targetHoursUTC,
        targetMinutesUTC,
        0,
        0
    ));

    // If the targetDate (which is now in UTC, representing JST time) is in the past relative to 'now' (UTC),
    // it's likely meant for the next day. So, advance targetDate by one day.
    if (targetDate.getTime() < now.getTime()) {
        targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }

    return targetDate;
};

const router = Router();

// --- New function to get filtered and sorted flights ---
async function getFilteredAndSortedFlights(env: Env): Promise<any[]> {
    const flights = await fetchFlightInformation(env);
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const oneHourLater = new Date(now.getTime() + 1 * 60 * 60 * 1000);

    const processedFlights = flights.map(flight => {
        return {
            ...flight,
            actualDateTime: getDateFromHHMM(flight["odpt:actualArrivalTime"], flight["dc:date"], now),
            scheduledDateTime: getDateFromHHMM(flight["odpt:scheduledArrivalTime"], flight["dc:date"], now)
        };
    });

    const filteredFlights = processedFlights.filter(flight => {
        const targetTime = flight.actualDateTime || flight.scheduledDateTime;
        return targetTime && targetTime >= twoHoursAgo && targetTime <= oneHourLater;
    });

    const sortedFlights = filteredFlights.sort((a, b) => {
        const timeA = (a.actualDateTime || a.scheduledDateTime)?.getTime() || 0;
        const timeB = (b.actualDateTime || b.scheduledDateTime)?.getTime() || 0;
        return timeA - timeB; // Sort ascending
    });

    // Take the top 5 flights for display
    const displayFlights = sortedFlights.slice(0, 5);

    // Format for web display (simplified)
    return displayFlights.map(flight => ({
        airline: flight["odpt:operator"].replace('odpt.Operator:', ''),
        flightNumber: flight["odpt:flightNumber"].join('/'),
        scheduledTime: flight["odpt:scheduledArrivalTime"] || 'N/A',
        actualTime: flight["odpt:actualArrivalTime"] || '',
        terminal: flight["odpt:arrivalAirportTerminal"] ? flight["odpt:arrivalAirportTerminal"].replace('odpt.AirportTerminal:HND.', '') : 'N/A',
        // Add exit information if available from ODPT API, otherwise leave it out for now.
        // exit: flight["odpt:exit"] || 'N/A' // Placeholder for exit info
    }));
}

// Handle incoming webhooks from LINE
router.post('/webhook', async (request: IRequest, env: Env) => {
    const body = await request.json();
    const events = body.events;

    if (events && events.length > 0) {
        const event = events[0];
        if (event.type === 'message' && event.message.text === '到着状況') {
            // Reuse the logic to get filtered flights
            const displayFlights = await getFilteredAndSortedFlights(env);
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
                        return `[${flight.airline}] [${flight.flightNumber}]\n${timeInfo}\nターミナル: T${flight.terminal}`;
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
        const flights = await getFilteredAndSortedFlights(env);
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

// Fetch flight information from the ODPT API
async function fetchFlightInformation(env: Env): Promise<FlightInformation[]> {
    const response = await fetch(`https://api.odpt.org/api/v4/odpt:FlightInformationArrival?odpt:arrivalAirport=odpt.Airport:HND&acl:consumerKey=${env.ODPT_TOKEN}`);
    if (!response.ok) {
        console.error('Failed to fetch flight information:', await response.text());
        return [];
    }
    const data = await response.json() as FlightInformation[];
    return data;
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