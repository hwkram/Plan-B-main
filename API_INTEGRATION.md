# Plan B Frontend-Integration

Stand: 25. Oktober 2026. Dieses Dokument beschreibt den Audit-Branch und unterscheidet ihn ausdrücklich vom älteren ausgelieferten Heroku-JavaScript.

## API-Vertrag

Der vollständige Backend-Vertrag liegt in `API_CONTRACT.md` des Backend-Repositories. Die Frontend-Integration verwendet direkte Projektmitglieder, keine ausstehenden Einladungen und keine Invitation-Requests.

- Mitglieder hinzufügen: ausschließlich `POST /projects/{projectId}/members`.
- Request: `{"email":"member@example.test","role":"member"}` oder `{"email":"leader@example.test","role":"leader"}`.
- Authentifizierung: `Authorization: Bearer <JWT>`; niemals ein Token im JSON-Body.
- Mitglieder lesen: separate `GET /projects/{projectId}/members`-Abfrage zusätzlich zu den Projektdetails.
- Rollen ändern: `PUT /projects/{projectId}/members/{userId}`, Body `{"role":"leader"}` bzw. `member`.
- Mitglied entfernen: `DELETE /projects/{projectId}/members/{userId}`.
- Backend-Rollen `PROJECT_LEADER` und `MEMBER` werden in die bestehenden UI-Werte `PROJEKTLEITUNG` und `TEAMMITGLIED` übersetzt.
- Mitglieder heißen in der API `userId`, `firstName`, `lastName`, `email`, `role`; Namen werden aus Vor-/Nachname gebildet.
- Projektupdate: unverschachteltes `{"name":"...","description":"...","status":"ACTIVE"}` per PUT. Status `ABGESCHLOSSEN` wird zu `COMPLETED`.
- Taskupdate: unverschachtelter Task-Body per PUT, kein `update`-Wrapper.
- Numerische Teilnehmer- und Assignee-IDs werden für die bestehenden DOM-Vergleiche in Strings normalisiert. Ausgehende numerische Strings werden vom Backend als Long-Werte gelesen.
- Task-IDs sind opak und heißen z. B. `m12` oder `t12`, um Meeting-/Long-To-do-Kollisionen zu vermeiden.

401 verwirft JWT, lokale Benutzer-ID und Benutzer-Cache und führt zur vorhandenen Login-Seite. 403 und 409 werden nicht in einen Logout umgedeutet. Logout entfernt die lokale Sitzung auch dann, wenn der Backend-Request fehlschlägt; das Backend arbeitet zustandslos und widerruft bereits ausgestellte Tokens nicht serverseitig.

## UI-Verhalten

Nur Projektleitungen sehen Mitgliederverwaltungs- und Task-Bearbeitungsaktionen. Die Oberfläche schützt die letzte Projektleitung; der Backend-Schutz gilt zusätzlich transaktional, auch bei parallelen Requests. Neue Benutzer müssen sich zunächst registrieren, bevor ihre E-Mail als Mitglied hinzugefügt werden kann.

Das Home-Menü verwendet das Heroku-Backend und hat den Auth-Bypass nicht mehr aktiviert. Login-Weiterleitungen und der Projekt-Navigationspfad sind korrigiert. Tote Links zu nicht vorhandenen Benutzer-, Kalender- und Einladungsseiten wurden entfernt. Fehlende Mitgliederzahlen oder Bearbeitungsdaten werden nicht durch erfundene Werte ersetzt.

Die früheren Invitation-Hilfsmethoden sind nur noch Kompatibilitätsstubs ohne Netzwerkzugriff. Direkte Mitgliederverwaltung verwendet `api.addMember`.

## Prüfungen

```sh
node --test tests/api-contract.test.cjs
find . -name '*.js' -not -path './.git/*' -exec node --check {} \;
```

Die 13 Node-Tests prüfen konkrete HTTP-Pfade, Authorization-Header, tokenfreie JSON-Bodies, Rollen-/ID-Normalisierung, separate Mitgliederabfragen, PUT-Formate, ausbleibende Invitation-Requests, 401/403/409-Verhalten und lokalen Logout.

Schreibende Browser- und Backend-Tests gehören ausschließlich gegen ein lokales Testsystem. Das Backend benötigt vor einem Produktivdeploy die neue additive Migration `008_add_meeting_priority.sql`. Frontend und Backend daher zusammen ausrollen, nicht nur das Frontend allein.

## Bekannte Zusatzlücken außerhalb der angefragten Endpunkte

Die bestehenden UI-Ansätze für Verfügbarkeit/freie Zeitfenster und Teilaufgaben-Zeitplanung besitzen noch keine passenden Backend-Endpunkte. Die Integration erfindet hierfür keine Erfolgsmeldungen oder gespeicherten Termine. Es existieren keine eigenständigen Benutzer-/Kalender-HTML-Seiten; eine Kalender-API ist im Backend-Audit-Branch vorhanden.
