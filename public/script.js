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

            // 出口ごとにフライトをグループ化
            const flightsByExit = flights.reduce((acc, flight) => {
                const exitKey = flight.exit || '不明な出口';
                if (!acc[exitKey]) {
                    acc[exitKey] = [];
                }
                acc[exitKey].push(flight);
                return acc;
            }, {});

            flightList.innerHTML = ''; // Clear loading message

            // 各出口のフライトを表示
            for (const exitKey in flightsByExit) {
                const exitSection = document.createElement('div');
                exitSection.classList.add('exit-section');

                const exitHeader = document.createElement('h2');
                exitHeader.textContent = `出口: ${exitKey}`;
                exitSection.appendChild(exitHeader);

                const exitFlightList = document.createElement('ul');
                exitFlightList.classList.add('exit-flight-list');

                // フライトを時間でソート
                flightsByExit[exitKey].sort((a, b) => {
                    const timeA = (a.actualDateTime || a.scheduledDateTime)?.getTime() || 0;
                    const timeB = (b.actualDateTime || b.scheduledDateTime)?.getTime() || 0;
                    return timeA - timeB; // Sort ascending
                }).forEach(flight => {
                    const flightItem = document.createElement('li');
                    flightItem.classList.add('flight-item');
                    flightItem.innerHTML = `
                        <span class="flight-time">${flight.actualTime || flight.scheduledTime}</span>
                        <span class="flight-info">${flight.airline} ${flight.flightNumber}</span>
                        <span class="flight-terminal">T${flight.terminal}</span>
                    `;
                    exitFlightList.appendChild(flightItem);
                });

                exitSection.appendChild(exitFlightList);
                flightList.appendChild(exitSection);
            }

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