import argparse
import asyncio
import hashlib
import json
import os
import random
from pathlib import Path


def ensure_parent(path_str: str):
    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


async def build_client(api_id: int, api_hash: str, session_path: str):
    from telethon import TelegramClient

    client = TelegramClient(session_path, api_id, api_hash)
    await client.connect()
    return client


def build_protocol():
    from telethon.tl import types

    return types.PhoneCallProtocol(
        udp_p2p=True,
        udp_reflector=True,
        min_layer=92,
        max_layer=92,
        library_versions=["pytgvoip"],
    )


def generate_dh_payload():
    # This is only the initial request payload for the outgoing call request step.
    # The full confirmed media path is handled later by the actual VoIP layer.
    p = int(
        "C71CAEB9C6B1C9048E6C522F70F13F73980D40238E3E21C14934D037563D930F"
        "48198A0A7C14058229493D22530F4DBFA336F6E0AC925139543AED44CCE7C372"
        "0FD51F69458705AC68CD4FE6B6B13ABDC9746512969328454F18FAF8C595F642"
        "477FE96BB2A941D5BCD1D4AC8CC49880708FA9B378E3C4F3A9060BEE67CF9A4A"
        "4A695811051907E162753B56B0F6B410DBA74D8A84B2A14B3144E0EF1284754F"
        "D17ED950D5965B4B9DD46582DB1178D169C6BC465B0D6FF9CA3928F7C2A11CC2"
        "9A818DDE9CA2F9A73D8A0E3A5B8A0D3C9D9A112F3E6E6A9D8C8D8A1D3CFD9B47",
        16,
    )
    g = 3
    a = random.SystemRandom().randint(2, p - 2)
    g_a = pow(g, a, p)
    g_a_bytes = g_a.to_bytes((g_a.bit_length() + 7) // 8, "big")
    g_a_hash = hashlib.sha256(g_a_bytes).digest()
    return a, g_a_bytes, g_a_hash


async def start_outgoing(args):
    from telethon.tl import functions

    client = await build_client(int(args.api_id), args.api_hash, args.session)
    try:
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram user account is not authorized yet.")

        target = await client.get_input_entity(args.target)
        random_id = random.SystemRandom().randint(1, 2**31 - 1)
        _a, g_a_bytes, g_a_hash = generate_dh_payload()

        result = await client(
            functions.phone.RequestCallRequest(
                user_id=target,
                random_id=random_id,
                g_a_hash=g_a_hash,
                protocol=build_protocol(),
            )
        )

        phone_call = getattr(result, "phone_call", None)
        call_id = getattr(phone_call, "id", None)
        state_path = ensure_parent(args.pending_call)
        state_path.write_text(
            json.dumps(
                {
                    "target": args.target,
                    "random_id": random_id,
                    "call_id": str(call_id) if call_id is not None else None,
                    "state": "request_sent",
                }
            ),
            encoding="utf-8",
        )

        print(
            json.dumps(
                {
                    "detail": f"Telegram call request sent to {args.target}.",
                    "call_id": str(call_id) if call_id is not None else None,
                }
            )
        )
    finally:
        await client.disconnect()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["start_outgoing"])
    parser.add_argument("--api-id", required=True)
    parser.add_argument("--api-hash", required=True)
    parser.add_argument("--phone", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--pending-call", required=True)
    parser.add_argument("--target", required=True)
    args = parser.parse_args()

    try:
        if args.command == "start_outgoing":
            asyncio.run(start_outgoing(args))
    except Exception as error:
        raise SystemExit(str(error))


if __name__ == "__main__":
    main()
