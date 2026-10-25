// KI-Log Nr. 21
// Produktionsbetrieb: Login-Wächter aktiv, Logout gegen das produktive Backend.
const API_URL = "https://plan-b-api-6486e78ed17c.herokuapp.com";
const DEV_BYPASS_AUTH = false;

if (!DEV_BYPASS_AUTH && !sessionStorage.getItem("token")) {
  window.location.replace("../../Login/HTML/login.html");
}

async function logout() {
  if (!confirm("Möchtest du dich wirklich abmelden?")) {
    return;
  }


  if (!DEV_BYPASS_AUTH) try {
    await fetch(API_URL + "/auth", {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "Authorization": "Bearer " + sessionStorage.getItem("token")
      }
    });
  } catch (error) {
    console.warn("Server nicht erreichbar, Abmeldung nur lokal:", error);
  }


  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user-id");
  window.location.replace("../../Login/HTML/login.html");
}

