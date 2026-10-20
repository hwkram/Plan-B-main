// KI-Log Nr. 18
$(".toggle-password").click(function () {
    const feld = $(this).siblings("input");
    const icon = $(this).find("img");
    const versteckt = feld.attr("type") === "password";

    feld.attr("type", versteckt ? "text" : "password");
    icon.attr("src", versteckt ? "../../icons/eye-slash.svg" : "../../icons/eye.svg");
    $(this).attr("aria-label", versteckt ? "Passwort verbergen" : "Passwort anzeigen");
});