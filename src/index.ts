import { Router, IRequest } from 'itty-router';

// Define the environment variables
export interface Env {
    
    LINE_TOKEN: string;
    LINE_USER_ID: string;
    STATIC_ASSETS: KVNamespace; // Add KV Namespace binding
}

import { parseDateTime } from './utils';
import { HanedaFlightInfo, fetchFlightInformation } from './hanedaApi';
import { fetchTTCInfo } from './ttcApi';

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
            } else {
                messagesToSend.push({ type: 'text', text: "現在、表示できる情報がありません。" });
            }

            if (messagesToSend.length > 0) {
                await sendLineReply(event.replyToken, messagesToSend, env);
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