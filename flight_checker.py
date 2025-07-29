import requests
import json
from datetime import datetime, time, timedelta
import os
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException

# --- 設定 ---
CONFIG_FILE = 'config.json'
# チェックする時間帯の開始時刻 (この時刻以降の便をチェック)
CHECK_START_TIME = time(22, 0)

# --- APIエンドポイント ---
MLIT_API_ENDPOINT = 'https://api.odpt.org/api/v4/odpt:FlightInformationArrival'
LINE_NOTIFY_API_ENDPOINT = 'https://notify-api.line.me/api/notify'
HANEDA_FLIGHT_INFO_URL = 'https://tokyo-haneda.com/flight/flightInfo_dms.html'

def load_config():
    """設定ファイルからAPIトークンを読み込む"""
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
            return config.get('line_notify_token'), config.get('mlit_api_token')
    except FileNotFoundError:
        print(f"エラー: 設定ファイル '{CONFIG_FILE}' が見つかりません。")
        print("config.json.template をコピーして config.json を作成し、アクセストークンを記入してください。")
        return None, None
    except json.JSONDecodeError:
        print(f"エラー: '{CONFIG_FILE}' の形式が正しくありません。")
        return None, None
    except KeyError:
        print(f"エラー: 設定ファイルに 'line_notify_token' または 'mlit_api_token' がありません。")
        return None, None

def get_flight_information(api_token):
    """国土交通省APIから羽田空港の到着便情報を取得する"""
    params = {
        'odpt:arrivalAirport': 'odpt.Airport:HND',
        'acl:consumerKey': api_token
    }
    try:
        response = requests.get(MLIT_API_ENDPOINT, params=params)
        response.raise_for_status()  # HTTPエラーがあれば例外を発生
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"APIからのデータ取得に失敗しました: {e}")
        return None

def scrape_haneda_exit_info():
    """Seleniumとwebdriver-managerを使って羽田空港のフライト情報ページから到着出口情報をスクレイピングする"""
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")

    driver = None
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        driver.get(HANEDA_FLIGHT_INFO_URL)

        # <tbody>要素内の<tr>（フライト情報の行）が表示されるまで最大20秒待機
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "tbody tr"))
        )

        soup = BeautifulSoup(driver.page_source, 'html.parser')
        exit_info = {}
        
        # <tbody>内のすべての<tr>を取得
        rows = soup.select('tbody tr')

        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 8: # セルが8個未満の行はスキップ
                continue

            # 航空会社名と便名を取得
            airline_logo_tag = cells[4].select_one('img')
            airline_name = airline_logo_tag['alt'] if airline_logo_tag and airline_logo_tag.has_attr('alt') else ''
            flight_number = cells[5].text.strip()
            
            # airline_nameが空文字の場合があるため、その場合はflight_numberのみを使用
            full_flight_name = f"{airline_name}{flight_number}" if airline_name else flight_number

            # 出口情報を取得
            exit_gate = cells[7].text.strip()

            if full_flight_name and exit_gate:
                exit_info[full_flight_name] = exit_gate
        
        return exit_info

    except TimeoutException:
        print("エラー: 出口情報の読み込みがタイムアウトしました。Webサイトの構造が変更された可能性があります。")
        return {}
    except Exception as e:
        print(f"出口情報の解析中に予期せぬエラーが発生しました: {e}")
        return {}
    finally:
        if driver:
            driver.quit()

def send_line_notification(message, token):
    """LINE Notifyにメッセージを送信する"""
    headers = {
        'Authorization': f'Bearer {token}'
    }
    data = {
        'message': message
    }
    try:
        response = requests.post(LINE_NOTIFY_API_ENDPOINT, headers=headers, data=data)
        response.raise_for_status()
        print("LINE通知を送信しました。")
    except requests.exceptions.RequestException as e:
        print(f"LINE通知の送信に失敗しました: {e}")
        if e.response is not None:
            print(f"ステータスコード: {e.response.status_code}")
            print(f"レスポンス: {e.response.text}")

def main():
    """メイン処理"""
    line_token, mlit_token = load_config()
    if not line_token or not mlit_token or "貼り付け" in line_token or "貼り付け" in mlit_token:
        print("設定ファイルにアクセストークンが設定されていません。処理を中断します。")
        return

    flight_data = get_flight_information(mlit_token)
    if not flight_data:
        return

    # Webサイトから出口情報を一度だけ取得
    exit_info_map = scrape_haneda_exit_info()

    late_night_delayed_flights = []
    now = datetime.now()
    today_date = now.date()
    tomorrow_date = today_date + timedelta(days=1)

    for flight in flight_data:
        # 国内線のみを対象
        if not flight.get('odpt:isDomestic', False):
            continue

        scheduled_time_str = flight.get('odpt:scheduledArrivalTime')
        if not scheduled_time_str:
            continue

        try:
            # 時刻文字列をdatetimeオブジェクトに変換
            scheduled_time_obj = datetime.strptime(scheduled_time_str, '%H:%M').time()
            
            # 日付を割り当て（深夜便は翌日扱い）
            flight_date = today_date
            if now.time() > CHECK_START_TIME and scheduled_time_obj < time(4, 0): # 22:00以降の実行で、時刻が早朝(4:00未満)なら翌日と判断
                 flight_date = tomorrow_date
            
            scheduled_datetime = datetime.combine(flight_date, scheduled_time_obj)

        except ValueError:
            continue # 時刻の形式が不正なデータはスキップ

        # 定刻が22時以降の便をチェック
        if scheduled_datetime.time() >= CHECK_START_TIME:
            flight_status = flight.get('odpt:flightStatus')
            estimated_time_str = flight.get('odpt:estimatedArrivalTime')

            # 遅延しているかどうかの判定
            is_delayed = (flight_status and 'Delayed' in flight_status) or \
                         (estimated_time_str and estimated_time_str != scheduled_time_str)

            if is_delayed and estimated_time_str:
                try:
                    estimated_time_obj = datetime.strptime(estimated_time_str, '%H:%M').time()
                    
                    # 変更後の到着時刻が24時を過ぎるか判定
                    if estimated_time_obj < scheduled_time_obj: # 日付をまたいだと判断
                        late_night_delayed_flights.append(flight)

                except ValueError:
                    continue # 変更後時刻の形式が不正なデータはスキップ

    if not late_night_delayed_flights:
        print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - 24時以降に到着する遅延便はありません。")
        return

    message_lines = [f"\n【✈24時以降に到着する遅延便 ({datetime.now().strftime('%m/%d %H:%M')})】"]
    for flight in late_night_delayed_flights:
        airline_code = flight.get('odpt:airline', 'N/A').replace('odpt.Operator:', '')
        flight_number = flight.get('odpt:flightNumber', 'N/A')
        departure_airport_raw = flight.get('odpt:departureAirport', 'N/A')
        departure_airport = departure_airport_raw.split('.')[-1] if '.' in departure_airport_raw else departure_airport_raw

        scheduled_time = flight.get('odpt:scheduledArrivalTime', 'N/A')
        estimated_time = flight.get('odpt:estimatedArrivalTime', 'N/A')
        
        # ターミナル情報を取得・整形
        terminal_raw = flight.get('odpt:arrivalAirportTerminal', 'N/A')
        terminal = ''
        if 'T1' in terminal_raw:
            terminal = '第1ターミナル'
        elif 'T2' in terminal_raw:
            terminal = '第2ターミナル'
        else:
            terminal = '情報なし'

        # 出口情報を取得
        # APIから取得した航空会社コードと便番号を結合
        full_flight_name = f"{airline_code}{flight_number}"
        exit_gate = exit_info_map.get(full_flight_name, '情報なし')

        flight_info = (
            f"\n--------------------\n"
            f"便名: {full_flight_name}\n"
            f"出発地: {departure_airport}\n"
            f"予定時刻: {scheduled_time}\n"
            f"変更後時刻: {estimated_time}\n"
            f"到着ターミナル: {terminal}\n"
            f"到着出口: {exit_gate}"
        )
        message_lines.append(flight_info)
    
    send_line_notification("\n".join(message_lines), line_token)

if __name__ == "__main__":
    main()