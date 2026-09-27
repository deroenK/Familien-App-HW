from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import json
import base64
from datetime import datetime, timezone, timedelta, date
import bcrypt
import jwt

from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    PublicKeyCredentialDescriptor,
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)
from pywebpush import webpush, WebPushException

# ------------------------------------------------------------------ config
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
RP_ID = os.environ['WEBAUTHN_RP_ID']
RP_NAME = os.environ['WEBAUTHN_RP_NAME']
ORIGIN = os.environ['WEBAUTHN_ORIGIN']
VAPID_PUBLIC_KEY = os.environ['VAPID_PUBLIC_KEY']
VAPID_PRIVATE_KEY = os.environ['VAPID_PRIVATE_KEY']
VAPID_SUBJECT = os.environ['VAPID_SUBJECT']

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ helpers
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def sanitize_user(user: dict) -> dict:
    if not user:
        return user
    u = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return u


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Nicht angemeldet")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="Benutzer nicht gefunden")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sitzung abgelaufen")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ungültiges Token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Nur für Administratoren")
    return user


# ------------------------------------------------------------------ models
class LoginBody(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    name: str = ""
    email: str = ""
    phone: str = ""
    birthday: str = ""
    bio: str = ""
    color: str = "#F59E0B"
    role: str = "user"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    birthday: Optional[str] = None
    bio: Optional[str] = None
    color: Optional[str] = None
    role: Optional[str] = None
    avatar: Optional[str] = None
    push_prefs: Optional[Dict[str, bool]] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PasswordReset(BaseModel):
    new_password: str


class Ingredient(BaseModel):
    name: str
    category: str = "Sonstiges"
    amount1: str = ""
    amount2: str = ""


class DishBody(BaseModel):
    name: str
    ingredients: List[Ingredient] = []


class MealEntryBody(BaseModel):
    date: str
    slot: str  # lunch | dinner
    name: str = ""
    dish_id: Optional[str] = None


class ShoppingItemBody(BaseModel):
    name: str
    category: str = "Sonstiges"


class EventBody(BaseModel):
    title: str
    date: str
    time: str = ""
    category: str = "sonstiges"  # birthday | sonstiges
    user_id: Optional[str] = None
    yearly_repeat: bool = False
    notify_hours: Optional[int] = None


class PushSubscribeBody(BaseModel):
    subscription: Dict[str, Any]


# ------------------------------------------------------------------ auth routes
@api_router.post("/auth/login")
async def login(body: LoginBody):
    user = await db.users.find_one({"username": body.username})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Benutzername oder Passwort falsch")
    token = create_access_token(user["id"])
    return {"token": token, "user": sanitize_user(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return sanitize_user(user)


# ------------------------------------------------------------------ WebAuthn
@api_router.post("/webauthn/register/begin")
async def webauthn_register_begin(user: dict = Depends(get_current_user)):
    options = generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=user["id"].encode("utf-8"),
        user_name=user["username"],
        user_display_name=user.get("name") or user["username"],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    await db.webauthn_challenges.update_one(
        {"user_id": user["id"], "purpose": "register"},
        {"$set": {"challenge": b64url_encode(options.challenge), "created_at": now_iso()}},
        upsert=True,
    )
    return json.loads(options_to_json(options))


@api_router.post("/webauthn/register/complete")
async def webauthn_register_complete(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    rec = await db.webauthn_challenges.find_one({"user_id": user["id"], "purpose": "register"})
    if not rec:
        raise HTTPException(status_code=400, detail="Keine Challenge gefunden")
    try:
        verification = verify_registration_response(
            credential=json.dumps(body),
            expected_challenge=b64url_decode(rec["challenge"]),
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registrierung fehlgeschlagen: {e}")
    await db.webauthn_credentials.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "credential_id": b64url_encode(verification.credential_id),
        "public_key": b64url_encode(verification.credential_public_key),
        "sign_count": verification.sign_count,
        "created_at": now_iso(),
    })
    await db.webauthn_challenges.delete_one({"user_id": user["id"], "purpose": "register"})
    return {"ok": True}


@api_router.post("/webauthn/authenticate/begin")
async def webauthn_auth_begin(body: Dict[str, str]):
    username = body.get("username")
    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    creds = await db.webauthn_credentials.find({"user_id": user["id"]}).to_list(100)
    if not creds:
        raise HTTPException(status_code=400, detail="Kein Fingerabdruck registriert")
    options = generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=b64url_decode(c["credential_id"])) for c in creds
        ],
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    await db.webauthn_challenges.update_one(
        {"user_id": user["id"], "purpose": "auth"},
        {"$set": {"challenge": b64url_encode(options.challenge), "created_at": now_iso()}},
        upsert=True,
    )
    return json.loads(options_to_json(options))


@api_router.post("/webauthn/authenticate/complete")
async def webauthn_auth_complete(body: Dict[str, Any]):
    username = body.get("username")
    credential = body.get("credential")
    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    rec = await db.webauthn_challenges.find_one({"user_id": user["id"], "purpose": "auth"})
    if not rec:
        raise HTTPException(status_code=400, detail="Keine Challenge gefunden")
    cred_id = credential.get("id") or credential.get("rawId")
    stored = await db.webauthn_credentials.find_one({"user_id": user["id"], "credential_id": cred_id})
    if not stored:
        # try match by rawId decoded
        creds = await db.webauthn_credentials.find({"user_id": user["id"]}).to_list(100)
        stored = creds[0] if creds else None
    if not stored:
        raise HTTPException(status_code=400, detail="Anmeldedaten nicht gefunden")
    try:
        verification = verify_authentication_response(
            credential=json.dumps(credential),
            expected_challenge=b64url_decode(rec["challenge"]),
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            credential_public_key=b64url_decode(stored["public_key"]),
            credential_current_sign_count=stored.get("sign_count", 0),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Anmeldung fehlgeschlagen: {e}")
    await db.webauthn_credentials.update_one(
        {"id": stored["id"]}, {"$set": {"sign_count": verification.new_sign_count}}
    )
    await db.webauthn_challenges.delete_one({"user_id": user["id"], "purpose": "auth"})
    token = create_access_token(user["id"])
    return {"token": token, "user": sanitize_user(user)}


@api_router.get("/webauthn/credentials")
async def webauthn_list(user: dict = Depends(get_current_user)):
    creds = await db.webauthn_credentials.find({"user_id": user["id"]}).to_list(100)
    return [{"id": c["id"], "created_at": c["created_at"]} for c in creds]


@api_router.delete("/webauthn/credentials/{cred_id}")
async def webauthn_delete(cred_id: str, user: dict = Depends(get_current_user)):
    await db.webauthn_credentials.delete_one({"id": cred_id, "user_id": user["id"]})
    return {"ok": True}


@api_router.get("/webauthn/available/{username}")
async def webauthn_available(username: str):
    user = await db.users.find_one({"username": username})
    if not user:
        return {"available": False}
    count = await db.webauthn_credentials.count_documents({"user_id": user["id"]})
    return {"available": count > 0}


# ------------------------------------------------------------------ profile
@api_router.put("/profile")
async def update_profile(body: UserUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None and k != "role"}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]})
    return sanitize_user(fresh)


@api_router.post("/profile/password")
async def change_password(body: PasswordChange, user: dict = Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Aktuelles Passwort falsch")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}


# ------------------------------------------------------------------ users (admin)
@api_router.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find().to_list(1000)
    return [sanitize_user(u) for u in users]


@api_router.post("/users")
async def create_user(body: UserCreate, admin: dict = Depends(require_admin)):
    existing = await db.users.find_one({"username": body.username})
    if existing:
        raise HTTPException(status_code=400, detail="Benutzername bereits vergeben")
    doc = body.model_dump()
    doc["password_hash"] = hash_password(doc.pop("password"))
    doc["id"] = str(uuid.uuid4())
    doc["avatar"] = None
    doc["push_prefs"] = {"calendar": True, "whiteboard": True, "chores": True}
    doc["created_at"] = now_iso()
    await db.users.insert_one(doc)
    return sanitize_user(doc)


@api_router.put("/users/{user_id}")
async def admin_update_user(user_id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    fresh = await db.users.find_one({"id": user_id})
    if not fresh:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return sanitize_user(fresh)


@api_router.post("/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, body: PasswordReset, admin: dict = Depends(require_admin)):
    res = await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(body.new_password)}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return {"ok": True}


@api_router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Eigenes Konto kann nicht gelöscht werden")
    await db.users.delete_one({"id": user_id})
    await db.webauthn_credentials.delete_many({"user_id": user_id})
    return {"ok": True}


# ------------------------------------------------------------------ dishes
@api_router.get("/dishes")
async def list_dishes(user: dict = Depends(get_current_user)):
    dishes = await db.dishes.find({}, {"_id": 0}).to_list(1000)
    return dishes


@api_router.post("/dishes")
async def create_dish(body: DishBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": body.name,
           "ingredients": [i.model_dump() for i in body.ingredients], "created_at": now_iso()}
    await db.dishes.insert_one(dict(doc))
    return doc


@api_router.put("/dishes/{dish_id}")
async def update_dish(dish_id: str, body: DishBody, user: dict = Depends(get_current_user)):
    updates = {"name": body.name, "ingredients": [i.model_dump() for i in body.ingredients]}
    await db.dishes.update_one({"id": dish_id}, {"$set": updates})
    fresh = await db.dishes.find_one({"id": dish_id}, {"_id": 0})
    return fresh


@api_router.delete("/dishes/{dish_id}")
async def delete_dish(dish_id: str, user: dict = Depends(get_current_user)):
    await db.dishes.delete_one({"id": dish_id})
    return {"ok": True}


# ------------------------------------------------------------------ meal plan
@api_router.get("/mealplan")
async def get_mealplan(start: str, days: int = 7, user: dict = Depends(get_current_user)):
    start_date = datetime.strptime(start, "%Y-%m-%d").date()
    dates = [(start_date + timedelta(days=i)).isoformat() for i in range(days)]
    entries = await db.mealplan_entries.find({"date": {"$in": dates}}, {"_id": 0}).to_list(1000)
    result: Dict[str, Dict[str, Any]] = {d: {} for d in dates}
    for e in entries:
        result[e["date"]][e["slot"]] = e
    return {"dates": dates, "entries": result}


@api_router.put("/mealplan/entry")
async def set_meal_entry(body: MealEntryBody, user: dict = Depends(get_current_user)):
    doc = {"date": body.date, "slot": body.slot, "name": body.name, "dish_id": body.dish_id}
    await db.mealplan_entries.update_one(
        {"date": body.date, "slot": body.slot}, {"$set": doc}, upsert=True
    )
    return doc


@api_router.delete("/mealplan/entry")
async def delete_meal_entry(date: str, slot: str, user: dict = Depends(get_current_user)):
    await db.mealplan_entries.delete_one({"date": date, "slot": slot})
    return {"ok": True}


@api_router.post("/mealplan/to-shopping")
async def mealplan_to_shopping(start: str, days: int = 7, persons: int = 2, user: dict = Depends(get_current_user)):
    start_date = datetime.strptime(start, "%Y-%m-%d").date()
    dates = [(start_date + timedelta(days=i)).isoformat() for i in range(days)]
    entries = await db.mealplan_entries.find({"date": {"$in": dates}, "dish_id": {"$ne": None}}).to_list(1000)
    added = 0
    for e in entries:
        dish = await db.dishes.find_one({"id": e["dish_id"]})
        if not dish:
            continue
        for ing in dish.get("ingredients", []):
            amount = ing.get("amount2") if persons == 2 else ing.get("amount1")
            name = ing["name"] + (f" ({amount})" if amount else "")
            await db.shopping_items.insert_one({
                "id": str(uuid.uuid4()), "name": name, "category": ing.get("category", "Sonstiges"),
                "checked": False, "created_at": now_iso(),
            })
            await _track_product(ing["name"], ing.get("category", "Sonstiges"))
            added += 1
    return {"added": added}


# ------------------------------------------------------------------ shopping list
async def _track_product(name: str, category: str):
    await db.product_usage.update_one(
        {"name": name}, {"$set": {"category": category}, "$inc": {"count": 1}}, upsert=True
    )


@api_router.get("/shopping")
async def get_shopping(user: dict = Depends(get_current_user)):
    items = await db.shopping_items.find({}, {"_id": 0}).to_list(1000)
    return items


@api_router.post("/shopping")
async def add_shopping(body: ShoppingItemBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": body.name, "category": body.category,
           "checked": False, "created_at": now_iso()}
    await db.shopping_items.insert_one(dict(doc))
    await _track_product(body.name, body.category)
    return doc


@api_router.put("/shopping/{item_id}/toggle")
async def toggle_shopping(item_id: str, user: dict = Depends(get_current_user)):
    item = await db.shopping_items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    await db.shopping_items.update_one({"id": item_id}, {"$set": {"checked": not item["checked"]}})
    return {"ok": True, "checked": not item["checked"]}


@api_router.delete("/shopping/{item_id}")
async def delete_shopping(item_id: str, user: dict = Depends(get_current_user)):
    await db.shopping_items.delete_one({"id": item_id})
    return {"ok": True}


@api_router.delete("/shopping")
async def clear_checked(user: dict = Depends(get_current_user)):
    await db.shopping_items.delete_many({"checked": True})
    return {"ok": True}


@api_router.get("/products/top")
async def top_products(user: dict = Depends(get_current_user)):
    products = await db.product_usage.find({}, {"_id": 0}).sort("count", -1).to_list(20)
    return products


# ------------------------------------------------------------------ calendar
@api_router.get("/events")
async def list_events(user: dict = Depends(get_current_user)):
    events = await db.events.find({}, {"_id": 0}).to_list(2000)
    users = await db.users.find().to_list(1000)
    umap = {u["id"]: u for u in users}
    for e in events:
        if e.get("category") == "birthday":
            e["color"] = "#F43F5E"
        elif e.get("user_id") and e["user_id"] in umap:
            e["color"] = umap[e["user_id"]].get("color", "#6366F1")
        else:
            e["color"] = "#6366F1"
        e["user_name"] = umap.get(e.get("user_id"), {}).get("name") if e.get("user_id") else None
    return events


@api_router.post("/events")
async def create_event(body: EventBody, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_by"] = user["id"]
    doc["created_at"] = now_iso()
    if not doc.get("user_id") and body.category != "birthday":
        doc["user_id"] = user["id"]
    await db.events.insert_one(dict(doc))
    # immediate push notification about new appointment
    await _send_push("calendar", "Neuer Termin", f"{body.title} am {body.date}")
    return {k: v for k, v in doc.items() if k != "_id"}


@api_router.put("/events/{event_id}")
async def update_event(event_id: str, body: EventBody, user: dict = Depends(get_current_user)):
    await db.events.update_one({"id": event_id}, {"$set": body.model_dump()})
    fresh = await db.events.find_one({"id": event_id}, {"_id": 0})
    return fresh


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    await db.events.delete_one({"id": event_id})
    return {"ok": True}


# ------------------------------------------------------------------ holidays (Mecklenburg-Vorpommern)
def _easter(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def mv_holidays(year: int) -> Dict[str, str]:
    easter = _easter(year)
    hol = {
        date(year, 1, 1): "Neujahr",
        date(year, 3, 8): "Internationaler Frauentag",
        easter - timedelta(days=2): "Karfreitag",
        easter + timedelta(days=1): "Ostermontag",
        date(year, 5, 1): "Tag der Arbeit",
        easter + timedelta(days=39): "Christi Himmelfahrt",
        easter + timedelta(days=50): "Pfingstmontag",
        date(year, 10, 3): "Tag der Deutschen Einheit",
        date(year, 10, 31): "Reformationstag",
        date(year, 12, 25): "1. Weihnachtstag",
        date(year, 12, 26): "2. Weihnachtstag",
    }
    return {d.isoformat(): name for d, name in hol.items()}


@api_router.get("/holidays")
async def holidays(year: int, user: dict = Depends(get_current_user)):
    return mv_holidays(year)


# ------------------------------------------------------------------ push
@api_router.get("/push/vapid-public-key")
async def vapid_public_key():
    return {"publicKey": VAPID_PUBLIC_KEY}


@api_router.post("/push/subscribe")
async def push_subscribe(body: PushSubscribeBody, user: dict = Depends(get_current_user)):
    sub = body.subscription
    await db.push_subscriptions.update_one(
        {"user_id": user["id"], "endpoint": sub["endpoint"]},
        {"$set": {"user_id": user["id"], "endpoint": sub["endpoint"], "subscription": sub, "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.post("/push/unsubscribe")
async def push_unsubscribe(user: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_many({"user_id": user["id"]})
    return {"ok": True}


@api_router.post("/push/test")
async def push_test(user: dict = Depends(get_current_user)):
    sent = await _send_push_to_user(user["id"], "Test-Benachrichtigung", "Push funktioniert! 🎉")
    return {"sent": sent}


async def _send_push_to_user(user_id: str, title: str, body: str, url: str = "/") -> int:
    subs = await db.push_subscriptions.find({"user_id": user_id}).to_list(100)
    return await _deliver(subs, title, body, url)


async def _send_push(pref_type: str, title: str, body: str, url: str = "/") -> int:
    users = await db.users.find({f"push_prefs.{pref_type}": True}).to_list(1000)
    uids = [u["id"] for u in users]
    subs = await db.push_subscriptions.find({"user_id": {"$in": uids}}).to_list(1000)
    return await _deliver(subs, title, body, url)


async def _deliver(subs: list, title: str, body: str, url: str) -> int:
    sent = 0
    for s in subs:
        try:
            webpush(
                subscription_info=s["subscription"],
                data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
                ttl=60,
            )
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                await db.push_subscriptions.delete_one({"_id": s["_id"]})
        except Exception as ex:
            logger.error(f"push error: {ex}")
    return sent


# ------------------------------------------------------------------ data export/import/reset
DATA_COLLECTIONS = ["users", "dishes", "mealplan_entries", "shopping_items", "product_usage", "events"]


@api_router.get("/admin/export")
async def export_data(admin: dict = Depends(require_admin)):
    dump = {}
    for coll in DATA_COLLECTIONS:
        docs = await db[coll].find({}, {"_id": 0}).to_list(100000)
        dump[coll] = docs
    dump["exported_at"] = now_iso()
    return dump


@api_router.post("/admin/import")
async def import_data(payload: Dict[str, Any], admin: dict = Depends(require_admin)):
    for coll in DATA_COLLECTIONS:
        if coll in payload and isinstance(payload[coll], list):
            await db[coll].delete_many({})
            if payload[coll]:
                await db[coll].insert_many([{k: v for k, v in d.items() if k != "_id"} for d in payload[coll]])
    return {"ok": True}


@api_router.post("/admin/reset")
async def reset_data(admin: dict = Depends(require_admin)):
    for coll in ["dishes", "mealplan_entries", "shopping_items", "product_usage", "events"]:
        await db[coll].delete_many({})
    return {"ok": True}


# ------------------------------------------------------------------ startup
async def seed():
    await db.users.create_index("username", unique=True)
    await db.push_subscriptions.create_index([("user_id", 1), ("endpoint", 1)], unique=True)
    admin_username = os.environ["ADMIN_USERNAME"]
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"username": admin_username})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "username": admin_username,
            "password_hash": hash_password(admin_password), "name": "Christian",
            "email": os.environ.get("ADMIN_EMAIL", ""), "phone": "", "birthday": "", "bio": "",
            "color": "#F59E0B", "role": "admin", "avatar": None,
            "push_prefs": {"calendar": True, "whiteboard": True, "chores": True},
            "created_at": now_iso(),
        })
        logger.info("Admin seeded")
    # default second family member
    if not await db.users.find_one({"username": "Mama"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "username": "Mama",
            "password_hash": hash_password("mama"), "name": "Mama",
            "email": "", "phone": "", "birthday": "", "bio": "",
            "color": "#F43F5E", "role": "user", "avatar": None,
            "push_prefs": {"calendar": True, "whiteboard": True, "chores": True},
            "created_at": now_iso(),
        })


@app.on_event("startup")
async def on_startup():
    await seed()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ================= Haushaltsplan / Whiteboard / Notizbuch =================
DATA_COLLECTIONS = DATA_COLLECTIONS + ["chores", "whiteboard_strokes", "notebooks", "notebook_pages"]


def _uname(u):
    return u.get("name") or u["username"]


class ChoreBody(BaseModel):
    title: str
    period: str = "week"


class StrokeBody(BaseModel):
    id: str
    stroke: Dict[str, Any]
    color: str = "#F59E0B"


class NotebookBody(BaseModel):
    title: Optional[str] = None
    icon: Optional[str] = None
    shared: Optional[bool] = None


class PageBody(BaseModel):
    title: Optional[str] = None
    content_html: Optional[str] = None
    canvas_data: Optional[str] = None


@api_router.get("/chores")
async def list_chores(period: str = "week", user: dict = Depends(get_current_user)):
    return await db.chores.find({"period": period}, {"_id": 0}).sort("created_at", 1).to_list(1000)


@api_router.post("/chores")
async def add_chore(body: ChoreBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "title": body.title, "period": body.period,
           "done": False, "done_by": None, "done_by_id": None, "done_at": None, "created_at": now_iso()}
    await db.chores.insert_one(dict(doc))
    return doc


@api_router.put("/chores/{cid}/toggle")
async def toggle_chore(cid: str, user: dict = Depends(get_current_user)):
    c = await db.chores.find_one({"id": cid})
    if not c:
        raise HTTPException(404, "Nicht gefunden")
    new_done = not c["done"]
    upd = {"done": new_done, "done_by": _uname(user) if new_done else None,
           "done_by_id": user["id"] if new_done else None, "done_at": now_iso() if new_done else None}
    await db.chores.update_one({"id": cid}, {"$set": upd})
    if new_done:
        await _send_push("chores", "Aufgabe erledigt", f"{_uname(user)} hat \"{c['title']}\" erledigt")
    return {"ok": True, **upd}


@api_router.delete("/chores/{cid}")
async def del_chore(cid: str, user: dict = Depends(get_current_user)):
    await db.chores.delete_one({"id": cid})
    return {"ok": True}


@api_router.post("/chores/reset")
async def reset_chores(period: str = "week", user: dict = Depends(get_current_user)):
    await db.chores.update_many({"period": period},
                                {"$set": {"done": False, "done_by": None, "done_by_id": None, "done_at": None}})
    return {"ok": True}


@api_router.get("/whiteboard")
async def get_whiteboard(user: dict = Depends(get_current_user)):
    return await db.whiteboard_strokes.find({}, {"_id": 0}).sort("created_at", 1).to_list(10000)


@api_router.post("/whiteboard")
async def add_stroke(body: StrokeBody, user: dict = Depends(get_current_user)):
    doc = {"id": body.id, "stroke": body.stroke, "color": body.color,
           "user_id": user["id"], "user_name": _uname(user), "created_at": now_iso()}
    await db.whiteboard_strokes.update_one({"id": body.id}, {"$set": doc}, upsert=True)
    return {"ok": True}


@api_router.post("/whiteboard/notify")
async def notify_whiteboard(user: dict = Depends(get_current_user)):
    await _send_push("whiteboard", "Whiteboard", f"{_uname(user)} hat etwas auf das Whiteboard geschrieben")
    return {"ok": True}


@api_router.delete("/whiteboard/{sid}")
async def del_stroke(sid: str, user: dict = Depends(get_current_user)):
    await db.whiteboard_strokes.delete_one({"id": sid})
    return {"ok": True}


@api_router.delete("/whiteboard")
async def clear_whiteboard(user: dict = Depends(get_current_user)):
    await db.whiteboard_strokes.delete_many({})
    return {"ok": True}


def _nb_filter(user):
    if user.get("role") == "admin":
        return {}
    return {"$or": [{"owner_id": user["id"]}, {"shared": True}]}


@api_router.get("/notebooks")
async def list_notebooks(user: dict = Depends(get_current_user)):
    books = await db.notebooks.find(_nb_filter(user), {"_id": 0}).sort("created_at", 1).to_list(1000)
    for b in books:
        b["page_count"] = await db.notebook_pages.count_documents({"notebook_id": b["id"]})
        b["is_owner"] = b["owner_id"] == user["id"]
    return books


@api_router.post("/notebooks")
async def create_notebook(body: NotebookBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "title": body.title or "Neues Buch", "icon": body.icon or "book",
           "owner_id": user["id"], "owner_name": _uname(user), "shared": False, "created_at": now_iso()}
    await db.notebooks.insert_one(dict(doc))
    return {k: v for k, v in doc.items()}


@api_router.put("/notebooks/{nid}")
async def update_notebook(nid: str, body: NotebookBody, user: dict = Depends(get_current_user)):
    nb = await db.notebooks.find_one({"id": nid})
    if not nb:
        raise HTTPException(404, "Nicht gefunden")
    if nb["owner_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Keine Berechtigung")
    upd = {k: v for k, v in {"title": body.title, "icon": body.icon, "shared": body.shared}.items() if v is not None}
    if upd:
        await db.notebooks.update_one({"id": nid}, {"$set": upd})
    return await db.notebooks.find_one({"id": nid}, {"_id": 0})


@api_router.delete("/notebooks/{nid}")
async def delete_notebook(nid: str, user: dict = Depends(get_current_user)):
    nb = await db.notebooks.find_one({"id": nid})
    if not nb:
        return {"ok": True}
    if nb["owner_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Keine Berechtigung")
    await db.notebooks.delete_one({"id": nid})
    await db.notebook_pages.delete_many({"notebook_id": nid})
    return {"ok": True}


@api_router.get("/notebooks/{nid}/pages")
async def list_pages(nid: str, user: dict = Depends(get_current_user)):
    return await db.notebook_pages.find({"notebook_id": nid}, {"_id": 0}).sort("order", 1).to_list(1000)


@api_router.post("/notebooks/{nid}/pages")
async def create_page(nid: str, body: PageBody, user: dict = Depends(get_current_user)):
    count = await db.notebook_pages.count_documents({"notebook_id": nid})
    doc = {"id": str(uuid.uuid4()), "notebook_id": nid, "title": body.title or f"Seite {count + 1}",
           "content_html": body.content_html or "", "canvas_data": body.canvas_data,
           "order": count, "created_at": now_iso(), "updated_at": now_iso()}
    await db.notebook_pages.insert_one(dict(doc))
    return {k: v for k, v in doc.items()}


@api_router.put("/pages/{pid}")
async def update_page(pid: str, body: PageBody, user: dict = Depends(get_current_user)):
    upd = {"updated_at": now_iso()}
    for k in ("title", "content_html", "canvas_data"):
        v = getattr(body, k)
        if v is not None:
            upd[k] = v
    await db.notebook_pages.update_one({"id": pid}, {"$set": upd})
    return await db.notebook_pages.find_one({"id": pid}, {"_id": 0})


@api_router.delete("/pages/{pid}")
async def delete_page(pid: str, user: dict = Depends(get_current_user)):
    await db.notebook_pages.delete_one({"id": pid})
    return {"ok": True}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
