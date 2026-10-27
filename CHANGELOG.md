# Changelog

## [Unreleased]

### Neu

- Eine Terminumfrage kann jetzt bis zu **16 Termine** haben. ([#84](https://github.com/christried/compies/issues/84))
- Du kannst „Wer kann wann?“ als CSV exportieren, zum Beispiel für Excel. ([#84](https://github.com/christried/compies/issues/84))
- Als Host kannst du in „Termine bearbeiten“ einen vorgeschlagenen Termin ändern, zum Beispiel von 19:00 auf 20:00 Uhr. Die Stimmen bleiben dabei erhalten. ([#85](https://github.com/christried/compies/issues/85))
- Auf der Seite „Neuigkeiten“ siehst du, was jede Version gebracht hat. Du findest sie im Menü, auf der Anmeldeseite und über die Versionsnummer. ([#80](https://github.com/christried/compies/issues/80))

### Geändert

- In „Wer kann wann?“ bleiben die Namen stehen, wenn du seitwärts scrollst. ([#84](https://github.com/christried/compies/issues/84))
- „Termin festlegen“ zeigt deutlich, welchen Termin du gewählt hast, auch bei vielen Terminen. ([#82](https://github.com/christried/compies/issues/82))
- Tippst du „15“ ins Uhrzeitfeld, wird daraus 15:00, und „15:3“ wird 15:30. ([#83](https://github.com/christried/compies/issues/83))

### Behoben

- Bekommt ein Event eine zweite Session oder bleibt nur noch eine übrig, ändert sich der Titel des Termins im Kalender. Holst du ihn nochmal über „In den Kalender“, übernimmt dein Kalender den neuen Titel jetzt auch. Bisher blieb der alte stehen. ([#67](https://github.com/christried/compies/issues/67))
- Entfernt der Host eine Session mit Termin, siehst du weiter den Hinweis „Der Termin … wurde aufgehoben“, damit du ihn aus deinem Kalender löschst. Das gilt auch für eine Session, deren Termin vorher aufgehoben wurde. ([#65](https://github.com/christried/compies/issues/65))

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
