const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; //KI-Log Nr. 6
const API_URL = "https://plan-b-api-6486e78ed17c.herokuapp.com"; //KI-Log Nr. 42: Zentrale Auth-URL.

$("#logon").click(function() {
    const email = $("#email-input").val().trim(); //KI-Log Nr. 9
    const password = $("#password-input").val();
    const user = { email: email, password: password };

    if (email === "" || password === "") {
        zeigeFehler("Bitte füllen Sie alle Felder aus.");
        return;
    }

    if (!EMAIL_MUSTER.test(email)) {
        zeigeFehler("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
        return;
    }
    versteckeFehler(); //KI-Log Nr. 7


    $.ajax({
          url: API_URL + '/auth', //KI-Log Nr. 42: Der Link bleibt getrennt vom JSON-Payload.
          type: 'POST',
          dataType: 'json',
          contentType: 'application/json',
          success: function (data) {
              if (!data || !data.token) {
                  zeigeFehler("Die Anmeldung war erfolgreich, aber der Server hat kein Token geliefert.");
                  return;
              }
              sessionStorage.setItem("token", data.token); //KI-Log Nr. 42: Token-Schlüssel zentral mit der API abstimmen.
              if (data.userId !== undefined) {
                  sessionStorage.setItem("user-id", data.userId);
              }
              window.location.href = "../../Home/HTML/index.html"; //KI-Log Nr. 8
          },
          data: JSON.stringify(user), //KI-Log Nr. 42: Zugangsdaten werden als JSON an /auth gesendet.
          processData: false,
          //KI-Log Nr. 10
          error: function (xhr) {
              if (xhr.status === 400 || xhr.status === 401) {
                  zeigeFehler("E-Mail oder Passwort ist falsch. Prüfen Sie Ihre Eingaben oder registrieren Sie sich.");
              } else if (xhr.status === 0) {
                  zeigeFehler("Der Server ist nicht erreichbar. Versuchen Sie es später erneut.");
              } else {
                  zeigeFehler("Es ist ein unerwarteter Fehler aufgetreten (Code " + xhr.status + "). Versuchen Sie es später erneut.");
              }
          }
      });
})




function versteckeFehler() { 
    $("#error-message").text("").prop("hidden", true); //KI-Log Nr. 7
}

function zeigeFehler(message) {
    $("#error-message").text(message).prop("hidden", false);
}