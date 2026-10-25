//KI-Log Nr. 23
// KI-Log Nr. 46: Token wird bei geschützten Requests ausschließlich im Header übertragen.
// KI-Log Nr. 44: Lokale Entwicklung kann ohne Login mit Mock-Daten laufen.
const API_URL = "https://plan-b-api-6486e78ed17c.herokuapp.com";
const DEV_BYPASS_AUTH = false;
 
const dialog = document.getElementById("dialog-projekt");
const form = document.getElementById("form-projekt");
const fehler = document.getElementById("fehler");
const meldung = document.getElementById("meldung");
const btnSpeichern = document.getElementById("btn-speichern");
 

const MELDUNGEN = {
  "title missing": "Bitte einen Titel eingeben.",
  "project not found": "Projekt nicht gefunden. Bitte die Projektübersicht neu laden."
};
 
const STATUS = { ACTIVE: "Aktiv", COMPLETED: "Abgeschlossen" };
const ROLLEN = { PROJECT_LEADER: "Projektleitung", MEMBER: "Teammitglied" };
 

function getToken() {
  const token = DEV_BYPASS_AUTH ? "development-token" : sessionStorage.getItem("token");
  if (!token) {
    window.location.href = "../../Login/HTML/login.html";
  }
  return token;
}
 
function zumLogin() {
  sessionStorage.removeItem("token");
  window.location.href = "../../Login/HTML/login.html";
}
 

document.getElementById("btn-neues-projekt").addEventListener("click", () => {
  form.reset();
  fehler.textContent = "";
  dialog.showModal();
});
 
document.getElementById("btn-abbrechen").addEventListener("click", () => dialog.close());
 

form.addEventListener("submit", async (event) => {
  event.preventDefault();
 
  const token = getToken();
  if (!token) return;
 
  const title = document.getElementById("input-titel").value.trim();
  const description = document.getElementById("input-beschreibung").value.trim();
 
  if (title === "") {
    fehler.textContent = MELDUNGEN["title missing"];
    return;
  }
 
  btnSpeichern.disabled = true; // verhindert doppeltes Anlegen
  try {
    const response = await fetch(`${API_URL}/projects`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ name: title, description })
    });
 
    if (response.status === 401) return zumLogin();
 
    const data = await response.json();
    if (!response.ok) {
      fehler.textContent = MELDUNGEN[data.message]
        || "Projekt konnte nicht erstellt werden. Bitte erneut versuchen.";
      return;
    }
 
    dialog.close();
    await projektAnzeigen(data.projectId, token);
  } catch (e) {
    fehler.textContent = "Server nicht erreichbar. Bitte Verbindung prüfen und erneut versuchen.";
  } finally {
    btnSpeichern.disabled = false;
  }
});
 

async function projektAnzeigen(projectId, token) {
  meldung.textContent = "";
  try {
    const response = await fetch(`${API_URL}/projects/${encodeURIComponent(projectId)}`, {
      headers: {
        "Accept": "application/json",
        "Authorization": "Bearer " + token
      }
    });
 
    if (response.status === 401) return zumLogin();
 
    const projekt = await response.json();
    if (!response.ok) {
      meldung.textContent = MELDUNGEN[projekt.message] || "Projekt konnte nicht geladen werden.";
      return;
    }
 
    
    document.getElementById("projekt-titel").textContent = projekt.title || projekt.name;
    document.getElementById("projekt-beschreibung").textContent = projekt.description || "";
    document.getElementById("projekt-status").textContent = STATUS[projekt.status] || projekt.status;
 
    const liste = document.getElementById("projekt-mitglieder");
    liste.replaceChildren();
    const membersResponse = await fetch(`${API_URL}/projects/${encodeURIComponent(projectId)}/members`, {
      headers: { Accept: "application/json", Authorization: "Bearer " + token }
    });
    if (membersResponse.status === 401) return zumLogin();
    if (!membersResponse.ok) throw new Error("Mitglieder konnten nicht geladen werden.");
    const members = await membersResponse.json();
    for (const mitglied of members) {
      const li = document.createElement("li");
      const name = [mitglied.firstName, mitglied.lastName].filter(Boolean).join(" ") || mitglied.email;
      li.textContent = `${name} (${ROLLEN[mitglied.role] || mitglied.role})`;
      liste.appendChild(li);
    }
 
    document.getElementById("projekt-ansicht").hidden = false;
  } catch (e) {
    meldung.textContent = "Projekt wurde erstellt, konnte aber nicht geladen werden. Bitte Seite neu laden.";
  }
}
