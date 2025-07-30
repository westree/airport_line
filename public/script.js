document.addEventListener('DOMContentLoaded', () => {
    const flightList = document.getElementById('flight-list');
    const lastUpdatedTime = document.getElementById('last-updated-time');
    const refreshButton = document.getElementById('refresh-button');

    async function fetchFlights() {
        flightList.innerHTML = '<div class="loading">フライト情報を読み込み中...</div>';
        try {
            const response = await fetch('/api/arrivals'); // Workerの新しいAPIエンドポイント
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const flights = await response.json();
            displayFlights(flights);
            updateLastUpdatedTime();
        } catch (error) {
            console.error("フライト情報の取得に失敗しました:", error);
            flightList.innerHTML = '<div class="error-message">フライト情報の取得に失敗しました。</div>';
        }
    }

    function displayFlights(flights) {
        flightList.innerHTML = ''; // Clear previous content
        if (flights.length === 0) {
            flightList.innerHTML = '<div class="error-message">現在、表示できる到着便情報がありません。</div>';
            return;
        }

        flights.forEach(flight => {
            const flightCard = document.createElement('div');
            flightCard.classList.add('flight-card');

            const airline = flight.airline;
            const flightNumber = flight.flightNumber;
            const scheduledTime = flight.scheduledTime;
            const actualTime = flight.actualTime;
            const terminal = flight.terminal;

            let timeInfo = `予定: ${scheduledTime}`;
            if (actualTime && actualTime !== 'N/A' && actualTime !== scheduledTime) {
                timeInfo += ` / 実際: ${actualTime}`;
            }

            flightCard.innerHTML = `
                <p class="flight-info">[${airline}] [${flightNumber}]</p>
                <p class="time-info">${timeInfo}</p>
                <p class="terminal-info">ターミナル: T${terminal}</p>
            `;
            flightList.appendChild(flightCard);
        });
    }

    function updateLastUpdatedTime() {
        const now = new Date();
        lastUpdatedTime.textContent = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // Initial fetch
    fetchFlights();

    // Refresh button click event
    refreshButton.addEventListener('click', fetchFlights);

    // Refresh every 60 seconds
    setInterval(fetchFlights, 60000);
});
