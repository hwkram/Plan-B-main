const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; //KI-Log Nr. 6
const API_URL = "https://plan-b-api-6486e78ed17c.herokuapp.com"; //KI-Log Nr. 42: Zentrale Auth-URL.

$("#register").click(function() {
    const firstName = $("#first-name-input").val().trim();
    const lastName = $("#last-name-input").val().trim();
    const email = $("#email-input").val().trim(); //KI-Log Nr. 10
    const password = $("#password-input").val();
    
    const user = {firstName: firstName, lastName: lastName , email: email, password: password };

    if (email === "" || password === "" || firstName === "" || lastName === "") {
        zeigeFehler("Bitte füllen Sie alle Felder aus.");
        return;
    }

    if (!EMAIL_MUSTER.test(email)) {
        zeigeFehler("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
        return;
    }
    if (password.length < 8) {
        zeigeFehler("Das Passwort muss mindestens 8 Zeichen lang sein.");
        return;
    }
    versteckeFehler(); //KI-Log Nr. 7
$.ajax({
          url: API_URL + '/users', //KI-Log Nr. 42: Link separat, JSON bleibt im Request-Body.
          type: 'post',
          dataType: 'json',
          contentType: 'application/json',
          data: JSON.stringify(user),
          //KI-Log Nr. 17
          success: function (data) {
                console.log("User erfolgreich registriert:", data);
                anmelden({ email: email, password: password });
        },
          //KI-Log Nr. 14
          error: function (xhr) {
            if (xhr.status === 400 && xhr.responseJSON && String(xhr.responseJSON.message).toLowerCase() === "user already exists") {
                zeigeFehler("Diese E-Mail ist bereits registriert. Melden Sie sich an oder verwenden Sie eine andere Adresse.");
            } else if (xhr.status === 400) {
                zeigeFehler("Bitte prüfen Sie Ihre Eingaben.");
            } else if (xhr.status === 0) {
                zeigeFehler("Der Server ist nicht erreichbar. Versuchen Sie es später erneut.");
            } else {
                zeigeFehler("Es ist ein unerwarteter Fehler aufgetreten (Code " + xhr.status + "). Versuchen Sie es später erneut.");
            }
        }
      });
})

//KI-Log Nr. 15
function anmelden(user) {
    $.ajax({
        url: API_URL + '/auth', //KI-Log Nr. 42: Link separat, Anmeldedaten als JSON.
        type: "post",
        dataType: "json",
        contentType: "application/json",
        data: JSON.stringify(user),
        success: function (data) {
            if (!data || !data.token) {
                zeigeFehler("Die Registrierung war erfolgreich, aber der Server hat kein Token geliefert.");
                return;
            }
            sessionStorage.setItem("token", data.token); //KI-Log Nr. 42: Gleicher Token-Schlüssel wie beim Login.
            if (data.userId !== undefined) {
                sessionStorage.setItem("user-id", data.userId);
            }
            window.location.href = "../../Home/HTML/index.html";
        },
        error: function () {
            window.location.href = "login.html";
        }
    });
}

function versteckeFehler() { 
    $("#error-message").text("").prop("hidden", true); //KI-Log Nr. 8
}

function zeigeFehler(message) {
    $("#error-message").text(message).prop("hidden", false);
}
