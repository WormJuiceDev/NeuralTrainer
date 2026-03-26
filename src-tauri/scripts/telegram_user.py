import argparse
import asyncio
import json
from pathlib import Path


async def build_client(api_id: int, api_hash: str, session_path: str):
    from telethon import TelegramClient

    client = TelegramClient(session_path, api_id, api_hash)
    await client.connect()
    return client


def ensure_parent(path_str: str):
    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


async def snapshot(args):
    client = await build_client(int(args.api_id), args.api_hash, args.session)
    try:
        authorized = await client.is_user_authorized()
        me_display = None
        detail = "Telegram user client is ready but not connected yet."
        if authorized:
            me = await client.get_me()
            if me:
                name_parts = [part for part in [getattr(me, "first_name", None), getattr(me, "last_name", None)] if part]
                display = " ".join(name_parts).strip()
                username = getattr(me, "username", None)
                if display and username:
                    me_display = f"{display} (@{username})"
                elif display:
                    me_display = display
                elif username:
                    me_display = f"@{username}"
                else:
                    me_display = str(getattr(me, "id", "connected"))
            detail = "Telegram user client is connected."
        print(json.dumps({
            "authorized": authorized,
            "me_display": me_display,
            "pending_code": Path(args.pending).exists(),
            "detail": detail,
        }))
    finally:
        await client.disconnect()


async def send_code(args):
    client = await build_client(int(args.api_id), args.api_hash, args.session)
    try:
        sent = await client.send_code_request(args.phone)
        pending_path = ensure_parent(args.pending)
        pending_path.write_text(json.dumps({
            "phone": args.phone,
            "phone_code_hash": sent.phone_code_hash,
        }), encoding="utf-8")
        print(json.dumps({
            "detail": f"A Telegram login code was sent to {args.phone}.",
        }))
    finally:
        await client.disconnect()


async def complete_login(args):
    from telethon import functions
    from telethon.errors import SessionPasswordNeededError

    pending_path = Path(args.pending)
    if not pending_path.exists():
        raise RuntimeError("There is no pending Telegram login code request. Send a code first.")
    pending = json.loads(pending_path.read_text(encoding="utf-8"))

    client = await build_client(int(args.api_id), args.api_hash, args.session)
    try:
        try:
            await client(functions.auth.SignInRequest(
                phone_number=pending["phone"],
                phone_code_hash=pending["phone_code_hash"],
                phone_code=args.code,
            ))
        except SessionPasswordNeededError:
            if not args.password:
                raise RuntimeError("This Telegram account requires a password. Enter it and try again.")
            await client.sign_in(password=args.password)

        if pending_path.exists():
            pending_path.unlink()
        print(json.dumps({
            "detail": "Telegram user account connected.",
        }))
    finally:
        await client.disconnect()


async def logout(args):
    client = await build_client(int(args.api_id), args.api_hash, args.session)
    try:
        if await client.is_user_authorized():
            await client.log_out()
        pending_path = Path(args.pending)
        if pending_path.exists():
            pending_path.unlink()
        session_files = list(Path(args.session).parent.glob(f"{Path(args.session).name}*"))
        for item in session_files:
            if item.exists():
                item.unlink()
        print(json.dumps({
            "detail": "Telegram user session cleared.",
        }))
    finally:
        await client.disconnect()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["snapshot", "send_code", "complete_login", "logout"])
    parser.add_argument("--api-id", required=True)
    parser.add_argument("--api-hash", required=True)
    parser.add_argument("--phone", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--pending", required=True)
    parser.add_argument("--code")
    parser.add_argument("--password")
    args = parser.parse_args()

    try:
      if args.command == "snapshot":
          asyncio.run(snapshot(args))
      elif args.command == "send_code":
          asyncio.run(send_code(args))
      elif args.command == "complete_login":
          asyncio.run(complete_login(args))
      elif args.command == "logout":
          asyncio.run(logout(args))
    except Exception as error:
      raise SystemExit(str(error))


if __name__ == "__main__":
    main()
