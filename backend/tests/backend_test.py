"""Comprehensive backend API tests for German Familien-App."""
import os
import io
import uuid
import requests
import pytest
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://household-planner-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "Admin", "password": "admin"}
MAMA = {"username": "Mama", "password": "mama"}


# ---------- fixtures
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def mama_token():
    r = requests.post(f"{API}/auth/login", json=MAMA, timeout=15)
    assert r.status_code == 200, f"mama login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- auth
class TestAuth:
    def test_login_success_admin(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "token" in j and isinstance(j["token"], str) and len(j["token"]) > 10
        assert j["user"]["username"] == "Admin"
        assert j["user"]["role"] == "admin"
        assert "password_hash" not in j["user"]

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"username": "Admin", "password": "wrong"}, timeout=15)
        assert r.status_code == 401
        assert "falsch" in r.json()["detail"].lower()

    def test_login_unknown_user(self):
        r = requests.post(f"{API}/auth/login", json={"username": "nobody", "password": "x"}, timeout=15)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["username"] == "Admin"


# ---------- role protection
class TestRoles:
    def test_non_admin_cannot_create_user(self, mama_token):
        r = requests.post(f"{API}/users", headers=h(mama_token),
                          json={"username": "TEST_x", "password": "x"}, timeout=15)
        assert r.status_code == 403

    def test_non_admin_cannot_export(self, mama_token):
        r = requests.get(f"{API}/admin/export", headers=h(mama_token), timeout=15)
        assert r.status_code == 403

    def test_non_admin_cannot_reset(self, mama_token):
        r = requests.post(f"{API}/admin/reset", headers=h(mama_token), timeout=15)
        assert r.status_code == 403


# ---------- users admin CRUD
class TestUsers:
    def test_list_users(self, admin_token):
        r = requests.get(f"{API}/users", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        users = r.json()
        names = [u["username"] for u in users]
        assert "Admin" in names and "Mama" in names

    def test_create_edit_reset_delete_user(self, admin_token):
        uname = f"TEST_user_{uuid.uuid4().hex[:6]}"
        # create
        r = requests.post(f"{API}/users", headers=h(admin_token),
                          json={"username": uname, "password": "pw123", "name": "Tester",
                                "email": "t@t.de", "role": "user"}, timeout=15)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # duplicate username
        r2 = requests.post(f"{API}/users", headers=h(admin_token),
                           json={"username": uname, "password": "pw"}, timeout=15)
        assert r2.status_code == 400
        # verify listed
        listed = requests.get(f"{API}/users", headers=h(admin_token), timeout=15).json()
        assert any(u["id"] == uid for u in listed)
        # edit
        r = requests.put(f"{API}/users/{uid}", headers=h(admin_token),
                        json={"name": "Tester2", "color": "#123456"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "Tester2"
        assert r.json()["color"] == "#123456"
        # reset pw
        r = requests.post(f"{API}/users/{uid}/reset-password", headers=h(admin_token),
                         json={"new_password": "newpw"}, timeout=15)
        assert r.status_code == 200
        # verify new pw works
        r = requests.post(f"{API}/auth/login", json={"username": uname, "password": "newpw"}, timeout=15)
        assert r.status_code == 200
        # delete
        r = requests.delete(f"{API}/users/{uid}", headers=h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_cannot_delete_self(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=h(admin_token), timeout=15).json()
        r = requests.delete(f"{API}/users/{me['id']}", headers=h(admin_token), timeout=15)
        assert r.status_code == 400


# ---------- profile
class TestProfile:
    def test_update_profile(self, mama_token):
        r = requests.put(f"{API}/profile", headers=h(mama_token),
                        json={"bio": "Hallo Familie", "phone": "0170"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["bio"] == "Hallo Familie"
        # cannot change role via /profile
        r = requests.put(f"{API}/profile", headers=h(mama_token),
                        json={"role": "admin"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "user"

    def test_change_password_wrong_current(self, mama_token):
        r = requests.post(f"{API}/profile/password", headers=h(mama_token),
                         json={"current_password": "wrong", "new_password": "x"}, timeout=15)
        assert r.status_code == 400

    def test_change_password_and_revert(self, mama_token):
        r = requests.post(f"{API}/profile/password", headers=h(mama_token),
                         json={"current_password": "mama", "new_password": "mama2"}, timeout=15)
        assert r.status_code == 200
        r = requests.post(f"{API}/auth/login", json={"username": "Mama", "password": "mama2"}, timeout=15)
        assert r.status_code == 200
        tok = r.json()["token"]
        # revert
        r = requests.post(f"{API}/profile/password", headers=h(tok),
                         json={"current_password": "mama2", "new_password": "mama"}, timeout=15)
        assert r.status_code == 200


# ---------- dishes
class TestDishes:
    def test_dish_crud(self, admin_token):
        r = requests.post(f"{API}/dishes", headers=h(admin_token),
                         json={"name": "TEST_Spaghetti",
                               "ingredients": [
                                   {"name": "Nudeln", "category": "Nudeln & Reis",
                                    "amount1": "125g", "amount2": "250g"},
                                   {"name": "Tomatensoße", "category": "Konserven",
                                    "amount1": "200ml", "amount2": "400ml"}
                               ]}, timeout=15)
        assert r.status_code == 200
        did = r.json()["id"]
        # list
        dishes = requests.get(f"{API}/dishes", headers=h(admin_token), timeout=15).json()
        assert any(d["id"] == did for d in dishes)
        # update
        r = requests.put(f"{API}/dishes/{did}", headers=h(admin_token),
                        json={"name": "TEST_Spaghetti2", "ingredients": []}, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Spaghetti2"
        # delete
        r = requests.delete(f"{API}/dishes/{did}", headers=h(admin_token), timeout=15)
        assert r.status_code == 200


# ---------- meal plan
class TestMealPlan:
    def test_mealplan_flow(self, admin_token):
        # create dish first
        r = requests.post(f"{API}/dishes", headers=h(admin_token),
                         json={"name": "TEST_Suppe",
                               "ingredients": [
                                   {"name": "Kartoffeln", "category": "Obst & Gemüse",
                                    "amount1": "300g", "amount2": "600g"}
                               ]}, timeout=15)
        did = r.json()["id"]
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        start = monday.isoformat()
        # get mealplan (empty)
        r = requests.get(f"{API}/mealplan?start={start}&days=7", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert len(r.json()["dates"]) == 7
        # set entry
        target_date = (monday + timedelta(days=2)).isoformat()
        r = requests.put(f"{API}/mealplan/entry", headers=h(admin_token),
                        json={"date": target_date, "slot": "dinner",
                              "name": "TEST_Suppe", "dish_id": did}, timeout=15)
        assert r.status_code == 200
        # confirm persisted
        r = requests.get(f"{API}/mealplan?start={start}&days=7", headers=h(admin_token), timeout=15)
        entries = r.json()["entries"]
        assert target_date in entries and "dinner" in entries[target_date]
        assert entries[target_date]["dinner"]["dish_id"] == did

        # transfer to shopping
        r = requests.post(f"{API}/mealplan/to-shopping?start={start}&days=7&persons=2",
                         headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["added"] >= 1

        # delete entry
        r = requests.delete(f"{API}/mealplan/entry?date={target_date}&slot=dinner",
                           headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        # cleanup
        requests.delete(f"{API}/dishes/{did}", headers=h(admin_token), timeout=15)


# ---------- shopping
class TestShopping:
    def test_shopping_crud(self, admin_token):
        # clear checked first
        # create
        r = requests.post(f"{API}/shopping", headers=h(admin_token),
                         json={"name": "TEST_Brot", "category": "Backwaren"}, timeout=15)
        assert r.status_code == 200
        iid = r.json()["id"]
        assert r.json()["checked"] is False
        # list
        items = requests.get(f"{API}/shopping", headers=h(admin_token), timeout=15).json()
        assert any(i["id"] == iid for i in items)
        # toggle
        r = requests.put(f"{API}/shopping/{iid}/toggle", headers=h(admin_token), timeout=15)
        assert r.status_code == 200 and r.json()["checked"] is True
        # top products
        r = requests.get(f"{API}/products/top", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert any(p["name"] == "TEST_Brot" for p in r.json())
        # clear checked (deletes)
        r = requests.delete(f"{API}/shopping", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        # delete: create another and delete
        r = requests.post(f"{API}/shopping", headers=h(admin_token),
                         json={"name": "TEST_Milch", "category": "Milchprodukte"}, timeout=15)
        iid = r.json()["id"]
        r = requests.delete(f"{API}/shopping/{iid}", headers=h(admin_token), timeout=15)
        assert r.status_code == 200


# ---------- events
class TestEvents:
    def test_event_crud(self, admin_token):
        r = requests.post(f"{API}/events", headers=h(admin_token),
                         json={"title": "TEST_Termin", "date": "2026-05-01", "time": "10:00",
                               "category": "sonstiges", "notify_hours": 24}, timeout=15)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        # list
        events = requests.get(f"{API}/events", headers=h(admin_token), timeout=15).json()
        found = [e for e in events if e["id"] == eid][0]
        assert found["color"]  # color assigned
        # birthday event -> shared color
        r = requests.post(f"{API}/events", headers=h(admin_token),
                         json={"title": "TEST_BDay", "date": "2026-06-15",
                               "category": "birthday", "yearly_repeat": True}, timeout=15)
        assert r.status_code == 200
        bid = r.json()["id"]
        events = requests.get(f"{API}/events", headers=h(admin_token), timeout=15).json()
        bd = [e for e in events if e["id"] == bid][0]
        assert bd["color"] == "#F43F5E"
        # update
        r = requests.put(f"{API}/events/{eid}", headers=h(admin_token),
                        json={"title": "TEST_Termin2", "date": "2026-05-02",
                              "category": "sonstiges"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Termin2"
        # delete
        assert requests.delete(f"{API}/events/{eid}", headers=h(admin_token), timeout=15).status_code == 200
        assert requests.delete(f"{API}/events/{bid}", headers=h(admin_token), timeout=15).status_code == 200


# ---------- holidays MV
class TestHolidays:
    def test_mv_holidays(self, admin_token):
        r = requests.get(f"{API}/holidays?year=2026", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        h_ = r.json()
        # MV includes Frauentag March 8 & Reformationstag Oct 31
        assert h_.get("2026-03-08") == "Internationaler Frauentag"
        assert h_.get("2026-10-31") == "Reformationstag"
        assert h_.get("2026-01-01") == "Neujahr"


# ---------- webauthn begin (auth only)
class TestWebAuthn:
    def test_register_begin(self, admin_token):
        r = requests.post(f"{API}/webauthn/register/begin", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "challenge" in j and "rp" in j

    def test_available_unknown(self, admin_token):
        r = requests.get(f"{API}/webauthn/available/nobody", timeout=15)
        assert r.status_code == 200
        assert r.json()["available"] is False


# ---------- push
class TestPush:
    def test_vapid_public_key(self):
        r = requests.get(f"{API}/push/vapid-public-key", timeout=15)
        assert r.status_code == 200
        assert r.json()["publicKey"]

    def test_push_test_no_subscription(self, admin_token):
        r = requests.post(f"{API}/push/test", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["sent"] == 0


# ---------- admin data export/import/reset
class TestAdminData:
    def test_export(self, admin_token):
        r = requests.get(f"{API}/admin/export", headers=h(admin_token), timeout=30)
        assert r.status_code == 200
        j = r.json()
        for coll in ["users", "dishes", "mealplan_entries", "shopping_items", "product_usage", "events"]:
            assert coll in j
        assert "exported_at" in j

    def test_reset_content_preserves_users(self, admin_token):
        # count users before
        before = requests.get(f"{API}/users", headers=h(admin_token), timeout=15).json()
        r = requests.post(f"{API}/admin/reset", headers=h(admin_token), timeout=30)
        assert r.status_code == 200
        after = requests.get(f"{API}/users", headers=h(admin_token), timeout=15).json()
        assert len(after) == len(before)
        # shopping should be empty
        items = requests.get(f"{API}/shopping", headers=h(admin_token), timeout=15).json()
        assert items == []


# ---------- chores (Haushaltsplan)
class TestChores:
    def test_chore_crud_and_toggle(self, admin_token):
        # add week chore
        r = requests.post(f"{API}/chores", headers=h(admin_token),
                         json={"title": "TEST_Putzen", "period": "week"}, timeout=15)
        assert r.status_code == 200
        cid = r.json()["id"]
        assert r.json()["done"] is False
        # list week
        items = requests.get(f"{API}/chores?period=week", headers=h(admin_token), timeout=15).json()
        assert any(c["id"] == cid for c in items)
        # toggle done -> should record done_by
        r = requests.put(f"{API}/chores/{cid}/toggle", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["done"] is True
        assert j["done_by"]  # name recorded
        # toggle again -> undone
        r = requests.put(f"{API}/chores/{cid}/toggle", headers=h(admin_token), timeout=15)
        assert r.json()["done"] is False
        # month period is separate
        r = requests.post(f"{API}/chores", headers=h(admin_token),
                         json={"title": "TEST_Fenster", "period": "month"}, timeout=15)
        mid = r.json()["id"]
        week_items = requests.get(f"{API}/chores?period=week", headers=h(admin_token), timeout=15).json()
        month_items = requests.get(f"{API}/chores?period=month", headers=h(admin_token), timeout=15).json()
        assert not any(c["id"] == mid for c in week_items)
        assert any(c["id"] == mid for c in month_items)
        # reset: mark week done then reset
        requests.put(f"{API}/chores/{cid}/toggle", headers=h(admin_token), timeout=15)
        r = requests.post(f"{API}/chores/reset?period=week", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        after = requests.get(f"{API}/chores?period=week", headers=h(admin_token), timeout=15).json()
        for c in after:
            assert c["done"] is False
        # cleanup
        requests.delete(f"{API}/chores/{cid}", headers=h(admin_token), timeout=15)
        requests.delete(f"{API}/chores/{mid}", headers=h(admin_token), timeout=15)


# ---------- whiteboard
class TestWhiteboard:
    def test_whiteboard_flow(self, admin_token):
        # clear all
        requests.delete(f"{API}/whiteboard", headers=h(admin_token), timeout=15)
        sid = str(uuid.uuid4())
        r = requests.post(f"{API}/whiteboard", headers=h(admin_token),
                         json={"id": sid, "stroke": {"tool": "pen", "points": [[0,0],[10,10]]},
                               "color": "#F59E0B"}, timeout=15)
        assert r.status_code == 200
        strokes = requests.get(f"{API}/whiteboard", headers=h(admin_token), timeout=15).json()
        assert any(s["id"] == sid for s in strokes)
        # notify
        r = requests.post(f"{API}/whiteboard/notify", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        # delete one
        r = requests.delete(f"{API}/whiteboard/{sid}", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        # clear all
        r = requests.delete(f"{API}/whiteboard", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert requests.get(f"{API}/whiteboard", headers=h(admin_token), timeout=15).json() == []


# ---------- notebooks
class TestNotebooks:
    def test_notebook_shared_with_targeted(self, admin_token, mama_token):
        # Admin creates a 3rd user
        uname = f"TEST_third_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/users", headers=h(admin_token),
                          json={"username": uname, "password": "pw", "name": "Third", "role": "user"}, timeout=15)
        assert r.status_code == 200
        third_id = r.json()["id"]
        third_tok = requests.post(f"{API}/auth/login", json={"username": uname, "password": "pw"}, timeout=15).json()["token"]
        # Mama id
        mama_me = requests.get(f"{API}/auth/me", headers=h(mama_token), timeout=15).json()
        mama_id = mama_me["id"]
        # Admin creates book, shares with Mama only
        r = requests.post(f"{API}/notebooks", headers=h(admin_token),
                         json={"title": "TEST_ShareTargeted"}, timeout=15)
        nb = r.json()["id"]
        r = requests.put(f"{API}/notebooks/{nb}", headers=h(admin_token),
                         json={"shared_with": [mama_id]}, timeout=15)
        assert r.status_code == 200
        assert mama_id in r.json().get("shared_with", [])
        # Mama can see it
        mama_books = requests.get(f"{API}/notebooks", headers=h(mama_token), timeout=15).json()
        assert any(b["id"] == nb for b in mama_books)
        # Third user cannot see
        third_books = requests.get(f"{API}/notebooks", headers=h(third_tok), timeout=15).json()
        assert not any(b["id"] == nb for b in third_books)
        # Mama can add page (access via _assert_notebook_access)
        r = requests.post(f"{API}/notebooks/{nb}/pages", headers=h(mama_token),
                         json={"title": "Mama page"}, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        # Third user cannot access pages (POST) -> 403
        r = requests.post(f"{API}/notebooks/{nb}/pages", headers=h(third_tok),
                         json={"title": "hax"}, timeout=15)
        assert r.status_code == 403
        # Third user cannot PUT page
        r = requests.put(f"{API}/pages/{pid}", headers=h(third_tok),
                        json={"content_html": "hax"}, timeout=15)
        assert r.status_code == 403
        # Now flip shared=True -> everyone
        r = requests.put(f"{API}/notebooks/{nb}", headers=h(admin_token),
                         json={"shared": True}, timeout=15)
        assert r.status_code == 200
        third_books = requests.get(f"{API}/notebooks", headers=h(third_tok), timeout=15).json()
        assert any(b["id"] == nb for b in third_books)
        # cleanup
        requests.delete(f"{API}/notebooks/{nb}", headers=h(admin_token), timeout=15)
        requests.delete(f"{API}/users/{third_id}", headers=h(admin_token), timeout=15)

    def test_notebook_and_pages_access_control(self, admin_token, mama_token):
        # Admin creates own book (private)
        r = requests.post(f"{API}/notebooks", headers=h(admin_token),
                         json={"title": "TEST_AdminBook", "icon": "book"}, timeout=15)
        assert r.status_code == 200
        admin_nb = r.json()["id"]
        # Mama creates a book
        r = requests.post(f"{API}/notebooks", headers=h(mama_token),
                         json={"title": "TEST_MamaBook"}, timeout=15)
        mama_nb = r.json()["id"]
        # Mama listing: should NOT see admin's private book
        mama_books = requests.get(f"{API}/notebooks", headers=h(mama_token), timeout=15).json()
        assert any(b["id"] == mama_nb for b in mama_books)
        assert not any(b["id"] == admin_nb for b in mama_books)
        # Admin listing: sees all
        admin_books = requests.get(f"{API}/notebooks", headers=h(admin_token), timeout=15).json()
        ids = [b["id"] for b in admin_books]
        assert admin_nb in ids and mama_nb in ids
        # Mama PUT on admin book -> 403
        r = requests.put(f"{API}/notebooks/{admin_nb}", headers=h(mama_token),
                        json={"title": "hax"}, timeout=15)
        assert r.status_code == 403
        # Mama DELETE on admin book -> 403
        r = requests.delete(f"{API}/notebooks/{admin_nb}", headers=h(mama_token), timeout=15)
        assert r.status_code == 403
        # Admin toggles shared on his book
        r = requests.put(f"{API}/notebooks/{admin_nb}", headers=h(admin_token),
                        json={"shared": True}, timeout=15)
        assert r.status_code == 200 and r.json()["shared"] is True
        # Now Mama can see it
        mama_books = requests.get(f"{API}/notebooks", headers=h(mama_token), timeout=15).json()
        assert any(b["id"] == admin_nb for b in mama_books)
        # add page
        r = requests.post(f"{API}/notebooks/{admin_nb}/pages", headers=h(admin_token),
                         json={"title": "Seite 1", "content_html": "<b>Hi</b>"}, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        pages = requests.get(f"{API}/notebooks/{admin_nb}/pages", headers=h(admin_token), timeout=15).json()
        assert any(p["id"] == pid for p in pages)
        # update page
        r = requests.put(f"{API}/pages/{pid}", headers=h(admin_token),
                        json={"content_html": "<i>Updated</i>", "canvas_data": "data:image/png;base64,abc"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["content_html"] == "<i>Updated</i>"
        assert r.json()["canvas_data"].startswith("data:image/png")
        # book page_count increases
        books = requests.get(f"{API}/notebooks", headers=h(admin_token), timeout=15).json()
        this_book = [b for b in books if b["id"] == admin_nb][0]
        assert this_book["page_count"] >= 1
        assert this_book["is_owner"] is True
        # delete page
        r = requests.delete(f"{API}/pages/{pid}", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        # cleanup books
        requests.delete(f"{API}/notebooks/{admin_nb}", headers=h(admin_token), timeout=15)
        requests.delete(f"{API}/notebooks/{mama_nb}", headers=h(mama_token), timeout=15)


# ---------- markers (Postkarten)
class TestMarkers:
    def test_marker_flow_shared_across_users(self, admin_token, mama_token):
        # clear
        requests.delete(f"{API}/markers", headers=h(admin_token), timeout=15)
        # Admin creates marker
        r = requests.post(f"{API}/markers", headers=h(admin_token),
                         json={"lat": 53.6355, "lng": 11.4010, "place": "TEST_Schwerin"}, timeout=15)
        assert r.status_code == 200
        mk = r.json()
        assert mk["place"] == "TEST_Schwerin"
        assert mk["user_name"]  # creator name populated
        assert mk["color"]      # color from profile
        assert "id" in mk
        mid = mk["id"]
        # Mama can list it (visible to all)
        listed = requests.get(f"{API}/markers", headers=h(mama_token), timeout=15).json()
        found = [m for m in listed if m["id"] == mid]
        assert found and found[0]["user_name"] == mk["user_name"]
        # Mama creates too
        r = requests.post(f"{API}/markers", headers=h(mama_token),
                         json={"lat": 52.5200, "lng": 13.4050, "place": "TEST_Berlin"}, timeout=15)
        mid2 = r.json()["id"]
        # Delete single
        r = requests.delete(f"{API}/markers/{mid}", headers=h(mama_token), timeout=15)
        assert r.status_code == 200
        remaining = requests.get(f"{API}/markers", headers=h(admin_token), timeout=15).json()
        assert not any(m["id"] == mid for m in remaining)
        assert any(m["id"] == mid2 for m in remaining)
        # Delete all
        r = requests.delete(f"{API}/markers", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        assert requests.get(f"{API}/markers", headers=h(admin_token), timeout=15).json() == []


# ---------- WebSocket whiteboard broadcast
class TestWhiteboardWS:
    def test_ws_broadcasts_add_delete_clear(self, admin_token):
        import websocket, threading, time, json
        ws_url = BASE_URL.replace("http://", "ws://").replace("https://", "wss://") + "/api/ws/whiteboard"
        received = []
        connected = threading.Event()
        closed = threading.Event()

        def on_msg(ws, msg):
            try:
                received.append(json.loads(msg))
            except Exception:
                pass

        def on_open(ws):
            connected.set()

        def on_close(ws, *a):
            closed.set()

        ws = websocket.WebSocketApp(ws_url, on_message=on_msg, on_open=on_open, on_close=on_close)
        t = threading.Thread(target=ws.run_forever, kwargs={"skip_utf8_validation": True}, daemon=True)
        t.start()
        assert connected.wait(10), "WS did not connect"
        time.sleep(0.5)
        # POST stroke via REST -> expect 'add' broadcast
        sid = str(uuid.uuid4())
        r = requests.post(f"{API}/whiteboard", headers=h(admin_token),
                         json={"id": sid, "stroke": {"tool": "pen", "points": [[0,0],[5,5]]},
                               "color": "#F59E0B"}, timeout=15)
        assert r.status_code == 200
        # DELETE single
        r = requests.delete(f"{API}/whiteboard/{sid}", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        # DELETE all
        r = requests.delete(f"{API}/whiteboard", headers=h(admin_token), timeout=15)
        assert r.status_code == 200
        # wait for messages
        deadline = time.time() + 5
        while time.time() < deadline and not (
            any(m.get("type") == "add" for m in received)
            and any(m.get("type") == "delete" for m in received)
            and any(m.get("type") == "clear" for m in received)
        ):
            time.sleep(0.2)
        ws.close()
        types = [m.get("type") for m in received]
        assert "add" in types, f"missing add in {types}"
        assert "delete" in types, f"missing delete in {types}"
        assert "clear" in types, f"missing clear in {types}"
        # verify add payload structure
        add_msg = next(m for m in received if m.get("type") == "add")
        assert add_msg["item"]["id"] == sid
        assert add_msg["item"]["color"] == "#F59E0B"
        assert add_msg["item"]["user_name"]
