// KI-Log Nr. 21
// KI-Log Nr. 44: Login-Wächter im lokalen Entwicklungsmodus deaktiviert.
const API_URL = "http://localhost:8080";
const DEV_BYPASS_AUTH = true;
 
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
  window.location.replace("../../Login/HTML/login.html");
}
 