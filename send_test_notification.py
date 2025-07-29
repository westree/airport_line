import requests
import json

# --- 設定ファイル ---
CONFIG_FILE = 'config.json'

# --- APIエンドポイント ---
LINE_NOTIFY_API_ENDPOINT = 'https://notify-api.line.me/api/notify'

def load_line_token():
    """設定ファイルからLINEのアクセストークンのみを読み込む"""
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
            token = config.get('line_notify_token')
            if not token or "貼り付け" in token:
                print("エラー: config.jsonにLINEのアクセストークンが設定されていません。")
                return None
            return token
    except FileNotFoundError:
        print(f"エラー: 設定ファイル '{CONFIG_FILE}' が見つかりません。")
        return None
    except (json.JSONDecodeError, KeyError):
        print(f"エラー: '{CONFIG_FILE}' の形式が正しくないか、キーが不足しています。")
        return None

def send_line_notification(message, token):
    """LINE Notifyにメッセージを送信する"""
    headers = {
        'Authorization': f'Bearer {token}'
    }
    data = {
        'message': message
    }
    print("LINE Notifyにテスト通知を送信します...")
    try:
        response = requests.post(LINE_NOTIFY_API_ENDPOINT, headers=headers, data=data)
        response.raise_for_status()
        print("テスト通知が正常に送信されました。LINEをご確認ください。")
    except requests.exceptions.RequestException as e:
        print(f"LINE通知の送信に失敗しました: {e}")
        if e.response is not None:
            print(f"ステータスコード: {e.response.status_code}")
            print(f"レスポンス: {e.response.text}")

def main():
    """メイン処理"""
    line_token = load_line_token()
    if not line_token:
        return

    test_message = "\n【テスト通知】\nこれは、Gemini CLIからのテストメッセージです。\nこのメッセージが届けば、LINE通知の設定は正常に完了しています。✈"
    send_line_notification(test_message, line_token)

if __name__ == "__main__":
    main()
