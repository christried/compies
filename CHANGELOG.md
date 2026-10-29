# Changelog

## [Unreleased]

### Neu

- Die Event-Seite aktualisiert sich jetzt von selbst: Was andere tun, siehst du sofort. Bricht die Verbindung ab, zeigt dir ein Hinweis oben, wann sie wieder steht. ([#156](https://github.com/christried/compies/issues/156))
- Unter **Aktivität** siehst du jetzt, was im Event passiert ist: wer dazugekommen ist, wann ein Termin feststand und was der Host geändert hat. ([#159](https://github.com/christried/compies/issues/159))
- Auf der Event-Seite gibt es jetzt das **Spielbrett**: Zieh dich in ein Team, auf die Bench oder auf die Tribüne. Die Teamwahl öffnet, sobald ein Termin steht, und alle sehen sofort, wer wo sitzt. ([#160](https://github.com/christried/compies/issues/160))
- Jedes Team bekommt jetzt seinen eigenen Namen: Alle im Team geben ein Wort ab, in der Reihenfolge, in der ihr beigetreten seid. ([#161](https://github.com/christried/compies/issues/161))
- Nach einem Update zeigt dir COMPIES einmal, was neu ist. Das gilt für dein Konto: Hast du es auf einem Gerät gesehen, kommt es auf den anderen nicht noch einmal. ([#184](https://github.com/christried/compies/issues/184))

### Geändert

- In der Host-Steuerung siehst du jetzt nur die wichtigsten Aktionen. Alles Weitere, etwa Termine bearbeiten und Einstellungen, findest du unter **Mehr**. ([#155](https://github.com/christried/compies/issues/155))
- Die Teamgröße geht in den Einstellungen nicht mehr unter das vollste Team. Wenn du Teams entfernst, gehen ihre Leute auf die Bench. ([#163](https://github.com/christried/compies/issues/163))

## [1.3.0] - 2026-10-29 – Spielvorbereitung

Eine Bibliothek für eure Spiele und ein Event, das du Schritt für Schritt einrichtest: Format, Punkte, Glücksrad oder Host-Wahl, Vetos und die Spielepools.

### Neu

- Ein neues Event legst du jetzt Schritt für Schritt an: Name, Format (Teams mit Anzahl und Größe), Anzahl Spiele, Punktetabelle und Termin. Am Ende siehst du alles auf einen Blick. ([#144](https://github.com/christried/compies/issues/144))
- Als Host findest du jetzt die **Bibliothek** in der Navigation. Dort legst du Spiele mit Namen und YouTube-Clip an: Startsekunde und Länge stellst du ein, und die Vorschau zeigt dir genau den Ausschnitt, der später läuft. ([#141](https://github.com/christried/compies/issues/141))
- Du kannst einem Spiel in der Bibliothek ein Bild geben. Es wird direkt im Browser passend zugeschnitten. ([#143](https://github.com/christried/compies/issues/143))
- Beim Anlegen wählst du jetzt den Auswahlmodus: Host-Wahl oder Glücksrad. Beim Glücksrad kannst du das Rad verdecken und festlegen, wie viele Vetos jede Partei hat. ([#145](https://github.com/christried/compies/issues/145))
- In der Bibliothek suchst du jetzt nach Namen und filterst nach Spielerzahl, „Passt zu“ oder deinen eigenen Spielen. Spiele, die du angelegt hast, kannst du bearbeiten und ihnen eine Spielerzahl und „Passt zu“ geben. ([#142](https://github.com/christried/compies/issues/142))
- Du kannst ein Spiel jetzt als **1 gegen 1** markieren: Unter „Passt zu“ wählst du Teams, Jeder gegen jeden oder 1 gegen 1, und in der Bibliothek filterst du danach. ([#171](https://github.com/christried/compies/issues/171))
- Beim Anlegen füllst du jetzt den Spielepool und einen eigenen Tiebreaker-Pool aus der Bibliothek. Fehlt ein Spiel, legst du es direkt dort an. Wird der Pool knapp, sagt dir die App Bescheid. ([#146](https://github.com/christried/compies/issues/146))
- Auf der Event-Seite siehst du jetzt unter „So wird gespielt“, wie das Event läuft: Format, Anzahl Spiele, Punkte, Auswahlmodus, Vetos und die Spiele im Pool. Ist das Rad verdeckt, siehst du nur, wie viele Spiele drin sind. ([#148](https://github.com/christried/compies/issues/148))
- Als Host änderst du die Einstellungen eines Events jetzt auch nachträglich über die Host-Steuerung. Läuft das Event schon, bleiben Format, Teamanzahl, Punktetabelle und Auswahlmodus fest; Anzahl Spiele, Teamgröße, Vetos, Rad verdecken und die Pools kannst du weiter ändern. Events von früher richtest du über „Event einrichten“ ein. ([#147](https://github.com/christried/compies/issues/147))

### Geändert

- Die Suche beim Füllen der Pools funktioniert jetzt wie die Suche in der Bibliothek. ([#173](https://github.com/christried/compies/issues/173))
- Ein Spiel, das schon im Pool ist, hat in der Suche ein rotes ✕, mit dem du es wieder herausnimmst. ([#173](https://github.com/christried/compies/issues/173))
- Beim Anlegen und Bearbeiten eines Events sitzen Zurück und Weiter jetzt in einer kompakten Leiste unten rechts, und „Bald verfügbar“ verdeckt keinen Text mehr. ([#174](https://github.com/christried/compies/issues/174))
- Wichtige Hinweise sind jetzt farbig: blau für Infos, gelb für Hinweise, rot für Kritisches. ([#172](https://github.com/christried/compies/issues/172))
- Eine Punktetabelle, in der jeder Platz gleich viele Punkte bekommt, geht nicht mehr: Platz 1 muss mehr bekommen als der letzte Platz. ([#175](https://github.com/christried/compies/issues/175))
- Die Terminumfrage zeigt jetzt, wie viele **vollständig** abgestimmt haben: Wer nur bei einem Teil der Termine abgestimmt hat, zählt noch nicht mit. ([#175](https://github.com/christried/compies/issues/175))
- Das Spielformular ist aufgeräumt: weniger Erklärtexte, und warum ein Spiel noch nicht gespeichert werden kann, steht jetzt in Rot. ([#176](https://github.com/christried/compies/issues/176))
- Die Datenschutzerklärung nennt jetzt den YouTube-Player und Cloudflare R2, über das wir die Spielebilder speichern. ([#179](https://github.com/christried/compies/issues/179))

### Sicherheit

- Bei verdecktem Rad erfährt niemand außer dem Host, welche Spiele im Pool sind, auch nicht über die Netzwerkdaten. ([#148](https://github.com/christried/compies/issues/148))

## [1.2.0] - 2026-10-28 – Mehr Termine

Bis zu 16 Termine pro Umfrage, eine Anmerkung zu deiner Stimme, Google Kalender oder Outlook mit einem Klick und eine Seite, auf der du siehst, was neu ist.

### Neu

- Eine Terminumfrage kann jetzt bis zu **16 Termine** haben. ([#84](https://github.com/christried/compies/issues/84))
- Du kannst „Wer kann wann?“ als CSV exportieren, zum Beispiel für Excel. ([#84](https://github.com/christried/compies/issues/84))
- Als Host kannst du in „Termine bearbeiten“ einen vorgeschlagenen Termin ändern, zum Beispiel von 19:00 auf 20:00 Uhr. Die Stimmen bleiben dabei erhalten. ([#85](https://github.com/christried/compies/issues/85))
- Auf der Seite „Neuigkeiten“ siehst du, was jede Version gebracht hat. Du kommst über die Versionsnummer unten auf jeder Seite hin, auf dem Handy über dein Profilbild. Ein „Neu“ daneben zeigt dir, dass es etwas Neues gibt. ([#80](https://github.com/christried/compies/issues/80))
- „In den Kalender“ öffnet Google Kalender, Outlook oder deine Kalender-App. Hat das Event mehrere Sessions, trägst du bei Google oder Outlook jede einzeln ein. ([#81](https://github.com/christried/compies/issues/81))
- Du kannst zu deiner Stimme eine kurze Anmerkung schreiben, zum Beispiel „kann maximal bis 20:30“. Alle im Event sehen sie. ([#102](https://github.com/christried/compies/issues/102))

### Geändert

- In „Wer kann wann?“ bleiben die Namen stehen, wenn du seitwärts scrollst. ([#84](https://github.com/christried/compies/issues/84))
- „Termin festlegen“ zeigt deutlich, welchen Termin du gewählt hast, auch bei vielen Terminen. ([#82](https://github.com/christried/compies/issues/82))
- Tippst du „15“ ins Uhrzeitfeld, wird daraus 15:00, und „15:3“ wird 15:30. ([#83](https://github.com/christried/compies/issues/83))
- Als Host findest du auf jeder Terminkarte jetzt „Termin festlegen“ statt „Diesen festlegen“. ([#122](https://github.com/christried/compies/issues/122))
- Impressum und Datenschutz stehen jetzt unten auf jeder Seite. Auf dem Handy findest du sie im Menü hinter deinem Profilbild. ([#123](https://github.com/christried/compies/issues/123))

### Behoben

- Bekommt ein Event eine zweite Session oder bleibt nur noch eine übrig, ändert sich der Titel des Termins im Kalender. Holst du ihn nochmal über „In den Kalender“, übernimmt dein Kalender den neuen Titel jetzt auch. Bisher blieb der alte stehen. ([#67](https://github.com/christried/compies/issues/67))
- Entfernt der Host eine Session mit Termin, siehst du weiter den Hinweis „Der Termin … wurde aufgehoben“, damit du ihn aus deinem Kalender löschst. Das gilt auch für eine Session, deren Termin vorher aufgehoben wurde. ([#65](https://github.com/christried/compies/issues/65))
- Wenn du in einem ausgefüllten Datum oder einer Uhrzeit nur einen Teil änderst, bleibt jetzt genau das stehen, was du tippst. ([#113](https://github.com/christried/compies/issues/113))
- Emojis wie 👍🏽, 🇩🇪 oder 👨‍👩‍👧 zählen in Namen jetzt als ein Zeichen, so wie du sie siehst. ([#76](https://github.com/christried/compies/issues/76))

## [1.1.2] - 2026-10-24 – Angemeldet bleiben

### Behoben

- Du bleibst angemeldet, solange du die App mindestens einmal pro Woche nutzt. Bisher wurdest du nach 7 Tagen abgemeldet. ([#64](https://github.com/christried/compies/issues/64))
- Läuft deine Anmeldung ab oder meldest du dich in einem anderen Tab ab, landest du auf der Anmeldeseite und danach wieder dort, wo du warst, statt bei einer Fehlermeldung. ([#66](https://github.com/christried/compies/issues/66))

## [1.1.1] - 2026-10-24 – Tab-Titel

### Behoben

- Der Titel des Browser-Tabs zeigt jetzt, wo du gerade bist: bei einer Einladung, beim Anmelden und auf Fehlerseiten. ([#10](https://github.com/christried/compies/issues/10))

## [1.1.0] - 2026-10-24 – Feinschliff

Nach den ersten Runden mit der Gruppe: klarere Abstimmung, mehrere Termine pro Event und ein paar Ecken, die vorher hakten.

### Neu

- Ein Event kann mehrere Sessions haben, jede mit eigenem Termin. ([#49](https://github.com/christried/compies/issues/49), [#52](https://github.com/christried/compies/issues/52), [#53](https://github.com/christried/compies/issues/53))
- Du kannst eine Session hinzufügen, entfernen und wieder öffnen. ([#55](https://github.com/christried/compies/issues/55))
- Du kannst „Meh“ als mittlere Antwort wählen, wenn ein Termin nur mit Vorbehalt geht. ([#50](https://github.com/christried/compies/issues/50))
- Du kannst Datum und Uhrzeit über eigene Felder mit Kalender und Uhrzeitliste wählen. ([#34](https://github.com/christried/compies/issues/34))

### Geändert

- Ein „Nein“ in der Abstimmung ist jetzt rot, damit es sich vom „Meh“ unterscheidet. ([#50](https://github.com/christried/compies/issues/50))
- Compies ist immer hell, unabhängig von den Einstellungen deines Geräts. ([#45](https://github.com/christried/compies/issues/45))
- Hinweise wie Toasts schweben über der Leiste für den Host, statt sie zu verdecken. ([#51](https://github.com/christried/compies/issues/51))

### Behoben

- Die Uhrzeit füllt sich beim Tippen von links nach rechts aus, auch mit „930“. ([#34](https://github.com/christried/compies/issues/34))
- Der Termin „Aufgehoben“ bleibt sichtbar, wenn du eine Session wieder öffnest. ([#36](https://github.com/christried/compies/issues/36))

## [1.0.0] - 2026-10-22 – Terminfindung

Die erste Version: ein Event anlegen, Termine vorschlagen, abstimmen und den Termin festlegen.

### Neu

- Du kannst ein Event anlegen und mehrere Terminvorschläge machen. ([#9](https://github.com/christried/compies/issues/9))
- Du kannst mit einem Einladungslink einem Event beitreten. ([#10](https://github.com/christried/compies/issues/10))
- Du kannst für jeden Terminvorschlag mit Ja oder Nein abstimmen und siehst, wer wann kann. ([#11](https://github.com/christried/compies/issues/11))
- Du kannst den Termin festlegen und ihn in deinen Kalender übernehmen. ([#13](https://github.com/christried/compies/issues/13))
- Auf der Startseite siehst du alle deine Events und die anstehenden Termine. ([#12](https://github.com/christried/compies/issues/12))
- Du kannst einen festgelegten Termin verschieben oder die Terminfindung wieder öffnen. ([#14](https://github.com/christried/compies/issues/14))
- Du kannst dich mit Discord oder Twitch anmelden. ([#7](https://github.com/christried/compies/issues/7))
- Du kannst Compies auf dem Handy wie eine App installieren. ([#5](https://github.com/christried/compies/issues/5))
