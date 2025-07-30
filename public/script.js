document.addEventListener('DOMContentLoaded', () => {
    const flightList = document.getElementById('flight-list');
    const lastUpdatedTime = document.getElementById('last-updated-time');
    const refreshButton = document.getElementById('refresh-button');

    const fetchFlightData = async () => {
        flightList.innerHTML = '<div class="loading">フライト情報を読み込み中...</div>';
        try {
            const response = await fetch('/api/arrivals'); // WorkersのAPIエンドポイントを叩く
            const flights = await response.json();

            if (flights.length === 0) {
                flightList.innerHTML = '<div class="error">現在、表示できるフライト情報がありません。</div>';
                return;
            }

            flightList.innerHTML = ''; // Clear loading message
            flights.forEach(flight => {
                const flightItem = document.createElement('div');
                flightItem.classList.add('flight-item');
                flightItem.innerHTML = `
                    <h2>${flight.airline} ${flight.flightNumber}</h2>
                    <p>予定時刻: ${flight.scheduledTime}</p>
                    <p>実際時刻: ${flight.actualTime || '--:--'}</p>
                    <p>ターミナル: ${flight.terminal}</p>
                    <p>出口: ${flight.exit}</p>
                `;
                flightList.appendChild(flightItem);
            });

            lastUpdatedTime.textContent = new Date().toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        } catch (error) {
            console.error('Error fetching flight data:', error);
            flightList.innerHTML = '<div class="error">フライト情報の取得に失敗しました。</div>';
        }
    };

    refreshButton.addEventListener('click', fetchFlightData);

    // 初回ロード時にデータを取得
    fetchFlightData();
});