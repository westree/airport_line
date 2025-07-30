export interface HanedaFlightInfo {
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

export async function fetchFlightInformation(): Promise<HanedaFlightInfo[]> {
    const response = await fetch("https://tokyo-haneda.com/app_resource/flight/data/dms/hdacfarv_v2.json");
    if (!response.ok) {
        console.error('Failed to fetch flight information from Haneda API:', await response.text());
        return [];
    }
    const data = await response.json();
    return data.flight_info as HanedaFlightInfo[];
}