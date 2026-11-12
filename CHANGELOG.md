# Changelog

## [Unreleased]

## [0.13.1] - 2026-11-12 – Kleinkram

Lauter Kleinigkeiten rund ums Spielformular: Du wählst den Bildausschnitt selbst, legst mit „Speichern und noch eins“ mehrere Spiele hintereinander an und speicherst mit Strg + Enter. Außerdem bleibt die Zahl der Vetos verborgen, bis ein Event startet.

### Neu

- **Speichern und noch eins:** Legst du mehrere Spiele hintereinander an, speichert „Speichern und noch eins“ das Spiel und leert das Formular für das nächste; der Cursor steht gleich im Namen. Nichts wird übernommen, auch das Bild nicht. „Spiel anlegen“ führt wie bisher auf die Seite des Spiels. ([#456](https://github.com/christried/compies/issues/456))
- **Bildausschnitt wählen:** Nach dem Wählen eines Bildes im Spielformular kannst du das Bild in der Kachel ziehen, mit Maus oder Finger, oder mit den Pfeiltasten verschieben, und es mit dem Regler darunter bis auf das Dreifache vergrößern, bis die Karte zeigt, was du willst. Was die Kachel zeigt, wird hochgeladen, und das Bild füllt die Kachel immer ganz. Fasst du es nicht an, bleibt es wie bisher in der Mitte. Das Original speichern wir nicht: Ein Bild, das ein Spiel schon hat, passt du an, indem du die Datei noch einmal wählst. ([#457](https://github.com/christried/compies/issues/457), [#516](https://github.com/christried/compies/issues/516))
- **Strg + Enter speichert das Spiel:** Im Spielformular speicherst du mit Strg + Enter, auf dem Mac mit ⌘ + Enter, aus jedem Feld, auch aus den Notizen. Ein „?“ oben rechts am Formular sagt es dir; auf dem Handy erscheint es nicht. ([#465](https://github.com/christried/compies/issues/465))

### Geändert

- **Die Zahl der Vetos bleibt bis zum Start verborgen:** Bevor die erste Session eines Events startet, weiß nur der Host, wie viele Vetos jede Partei hat. Alle anderen lesen in „So wird gespielt“ „Vetos: Anzahl erst zum Start“ und erfahren die Zahl auch sonst nirgends. Mit dem Start der ersten Session sehen sie alle, auch zwischen den Sessions und wenn das Event beendet ist. Bei Host-Wahl bleibt alles, wie es war. ([#453](https://github.com/christried/compies/issues/453))

### Behoben

- **Veto-Fenster:** Nach dem Aufdecken ist die Kachel eines Teams, das kein Veto eingelegt hat, jetzt abgedunkelt, wie vorgesehen. Bisher sah sie aus wie die der anderen Teams. ([#562](https://github.com/christried/compies/issues/562))

## [0.13.0] - 2026-11-12 – Clip

Der Clip, neu gefasst: Er läuft für alle gleich und lässt sich nicht mehr anhalten, darf 10 bis 120 Sekunden lang sein, und das Veto-Fenster richtet sich nach seiner Länge. Dazu kommt ein neues Ergebnis-Bild zum Teilen, die „Anzeigetafel“.

### Geändert

- **Der Clip läuft für alle gleich:** Das Video im Clip nimmt in einer Session keinen Tipp, Klick und keine Taste mehr an. Niemand kann es anhalten, YouTubes „Weitere Videos“ erscheinen nicht, und kein Link führt aus dem Event heraus. Stoppt dein Gerät das Video von sich aus, etwa durch die Kopfhörer-Taste, springt es zur Sekunde der anderen und läuft weiter. Ton an und aus, „Für mich schließen“ und für den Host „Clip überspringen“ bleiben. Der Titel des Videos zeigt sich in den ersten Sekunden: YouTube erlaubt nicht, ihn zu verbergen. ([#509](https://github.com/christried/compies/issues/509))
- **Clips von 10 bis 120 s:** Du kannst einem Spiel jetzt einen Clip von 10 bis 120 Sekunden geben, bisher 5 bis 60. Im Spielformular trägst du Start, Ende und Länge ein, zwei davon genügen: Die beiden Felder, die du zuletzt geändert hast, gelten, das dritte rechnet sich von selbst mit. Ein Clip, der kürzer als 10 Sekunden war, läuft jetzt 10 Sekunden ab derselben Stelle. ([#507](https://github.com/christried/compies/issues/507), [#508](https://github.com/christried/compies/issues/508))
- **Das Veto-Fenster passt zum Clip:** Es dauert jetzt so lange wie der Clip des gezogenen Spiels plus 30 Sekunden, bei einem Spiel ohne Video 30 Sekunden. Bisher waren es immer 60. Die Karte eines Spiels ohne Video bleibt dabei höchstens 30 Sekunden stehen. Überspringt der Host den Clip, endet das Fenster 30 Sekunden nach dem Überspringen, wenn das früher ist; länger wird es dadurch nie. Die Uhr zählt in Minuten und Sekunden. ([#505](https://github.com/christried/compies/issues/505), [#506](https://github.com/christried/compies/issues/506))
- **Neues Ergebnis-Bild:** Das Bild zum Teilen ist jetzt eine „Anzeigetafel“: oben der Name des Events mit den Terminen, groß in der Teamfarbe der Sieger mit seinen Punkten, dazu die Tabelle und die gespielten Spiele als schlichte Zeilen. Zu lange Namen werden mit „…“ gekürzt, lange Listen mit „+N weitere“. Endet ein Event unentschieden, steht jeder Sieger auf einem eigenen Band in seiner Teamfarbe, ab sieben Siegern die ersten fünf und „+N weitere“. Ein Spiel mit mehreren Erstplatzierten trägt einen geteilten Streifen. Das neue Bild gibt es auch für Events, die schon vorher zu Ende gingen. ([#510](https://github.com/christried/compies/issues/510), [#511](https://github.com/christried/compies/issues/511))

### Behoben

- **Clip im Querformat:** Hältst du das Handy quer, passt der Clip jetzt in den Bildschirm. Die Knöpfe unter dem Video, „Ton aus“, „Clip überspringen“ und „Für mich schließen“, bleiben erreichbar; bisher lagen sie unter dem Bildschirmrand. ([#549](https://github.com/christried/compies/issues/549))
- **Clip ohne Video:** Hat das gezogene Spiel kein Video, steht seine Karte auf dem Handy jetzt ganz im Clip. Bisher war sie oben abgeschnitten und lag unten über den Knöpfen. ([#555](https://github.com/christried/compies/issues/555))

## [0.12.0] - 2026-11-11 – Eventseite

Die Eventseite, gründlich überarbeitet: Spiele zeigen sich als Kacheln mit eigenem Dialog, die Bühne rückt nach oben, was gerade passiert ist, und dein Teamwort änderst du jetzt das ganze Event über. Aus Bench und Tribüne ist eine Tribüne geworden, und ein beendetes Event verrät den Sieger erst mit der Siegerehrung.

### Neu

- **Notizen im Spiele-Picker:** Beim Füllen des Spielepools und bei „Nächstes Spiel setzen“ hat ein Spiel mit Notizen jetzt einen Knopf „Notizen ansehen“. Er zeigt die Notizen, ohne dass du die Auswahl verlässt: am Desktop neben dem Spiel, auf dem Handy als Sheet von unten. ([#436](https://github.com/christried/compies/issues/436))
- **Free-to-play-Tag:** Ein Spiel ohne Preis oder mit dem Preis Free-to-play trägt in der Bibliothek jetzt von selbst den Tag „Free-to-play“, bei jedem Speichern. Bekommt es einen anderen Preis, fällt der Tag weg. ([#423](https://github.com/christried/compies/issues/423))
- **Spiel-Dialog für den Host:** Tippst du als Host auf ein Spiel auf der Eventseite, öffnet sich sein Dialog: Bild, Name, Spielerzahl, „Passt zu“, alle Tags, der Preis und deine Notizen, dazu „In der Bibliothek öffnen“. Das geht im Spielepool, bei „Zuletzt gezogen“ und bei „Gerade dran“, ohne dass du das Event verlässt. ([#443](https://github.com/christried/compies/issues/443))
- **Spiel-Dialog für Mitglieder:** Tippst du als Mitglied auf ein Spiel auf der Eventseite, öffnet sich sein Dialog, auf dem Handy als Sheet von unten: Bild, Name, Spielerzahl, „Passt zu“ und der Preis mit seinem Stand. Das geht im Spielepool, sobald der Host ihn zeigt, bei „Zuletzt gezogen“ und bei „Gerade dran“, ohne dass du das Event verlässt. Tags und Notizen siehst du dort nicht, und ein Spiel zeigt sich dir nie früher als bisher. ([#444](https://github.com/christried/compies/issues/444))

### Geändert

- **Spiele auf der Eventseite als Kacheln:** Jedes Spiel zeigt sich dort mit Bild und Namen, im Spielepool, bei „Zuletzt gezogen“ und bei „Gerade dran“. ([#435](https://github.com/christried/compies/issues/435))
- **Die Bühne folgt dem Spiel:** Wo gerade etwas passiert ist, rückt der Block eine halbe Sekunde später nach oben, bei allen zugleich: das Glücksrad beim Drehen, „Gerade dran“, wenn ein Spiel feststeht, die Tabelle bei einem neuen oder korrigierten Ergebnis, der Countdown beim Start und der Münzwurf beim Wurf. Das Neueste steht oben; das Spielbrett rückt nie hoch, und die Seite scrollt nie von allein. Die Tabelle spielt ihr Ergebnis erst, wenn sie oben angekommen ist. ([#441](https://github.com/christried/compies/issues/441), [#442](https://github.com/christried/compies/issues/442))
- **Teamnamen bleiben offen:** Dein Teamwort kannst du jetzt das ganze Event über ändern, auch zwischen zwei Sessions und wenn der Host dich erst nach dem Start in ein Team gesetzt hat. Der Teamname friert beim Start nicht mehr ein; der Host kann ihn weiter jederzeit auf den Farbnamen zurücksetzen. ([#438](https://github.com/christried/compies/issues/438))
- **Eine Tribüne statt Bench und Tribüne:** Wer in keinem Team sitzt, sitzt jetzt auf der Tribüne, ganz gleich, ob er später mitspielt oder nur zuschaut. Neue Mitglieder landen dort, wenn sie über den Einladungslink kommen, und ebenso die Spieler eines Teams, das der Host abschafft. Von der Tribüne ziehen sich die Spieler wie bisher in ein Team. Die Bench gibt es nicht mehr. ([#437](https://github.com/christried/compies/issues/437))
- **Siegerehrung zuerst:** Ein beendetes Event verrät den Sieger erst, wenn der Host die Siegerehrung gestartet hat. Bis dahin steht auf der Seite eine Karte „Die Siegerehrung steht noch aus.“, und Tabelle, Spielverlauf, „Bild teilen“, der Partyhut und die Sieger in der Kopfzeile und in der Aktivität warten mit. Wer die Siegerehrung live schaut, sieht den Rest, sobald sie zu Ende ist oder er sie überspringt oder schließt; wer später dazukommt oder den Start verpasst hat, sieht gleich alles. Schon beendete Events bleiben, wie sie sind. ([#445](https://github.com/christried/compies/issues/445))
- Die Datenschutzerklärung beschreibt jetzt die Tribüne und die offenen Teamnamen: Der Aktivitäts-Feed hält den Teamnamen fest, den ein Team bei jedem Eintrag hatte, ein Teamwort bleibt in diesen Einträgen also stehen, solange das Event besteht. Sie nennt außerdem, dass das Ergebnisbild erst nach dem Start der Siegerehrung bereitsteht und dass der Host eines Events die Notizen eines dort gespielten Spiels liest. ([#446](https://github.com/christried/compies/issues/446))
- **Aktivität: Teams heißen, wie sie damals hießen:** Jeder Eintrag in der Aktivität nennt ein Team so, wie es in diesem Moment hieß, mit dem Zeichen seiner Teamfarbe daneben. Benennt sich ein Team später um, behalten die alten Einträge den alten Namen. Auch Verschiebungen, Zurücksetzungen und Bonus-Vetos nennen nicht mehr nur die Farbe. Tabelle, Spielverlauf und alles andere zeigen weiter den aktuellen Namen, und Einträge aus der Zeit davor bleiben, wie sie waren. ([#440](https://github.com/christried/compies/issues/440))
- **Navigation auf der Eventseite:** Auf dem Computer und auf großen Tablets steht die Hauptnavigation jetzt auch auf der Eventseite oben im Kopf: Events, Archiv und Profil, für Hosts auch die Bibliothek. „Events“ ist als aktuelle Seite markiert, und darunter stehen der Name des Events und seine Phase. Auf dem Handy bleibt alles, wie es war. ([#426](https://github.com/christried/compies/issues/426))

### Behoben

- **Ziehen auf ein Team:** Ziehst du jemanden über ein Team oder über die Tribüne, zeigt deren Rand jetzt die Fokusfarbe, wie gedacht. Bisher blieb er in der Linienfarbe. ([#496](https://github.com/christried/compies/issues/496))
- **Das Spielbrett bleibt stehen:** Hast du die Eventseite bis zum Spielbrett gescrollt, springt es nicht mehr weg, wenn der Host ein Spiel mit Veto-Fenster setzt und unten die Veto-Leiste erscheint. ([#541](https://github.com/christried/compies/issues/541))

## [0.11.0] - 2026-11-10 – Profil

Deine eigene Profil-Seite: Dort änderst du deinen Anzeigenamen, schaltest den Ton und wählst die Darstellung, Hell, Dunkel oder System. Dazu tragen die Tags in der Bibliothek jetzt Farben.

### Neu

- **Profil:** „Profil“ in der Navigation öffnet jetzt eine eigene Seite. Dort siehst du dein Bild und änderst deinen Anzeigenamen, so oft du willst: Nach „Speichern“ steht der neue Name sofort oben in deinem Menü, und die anderen sehen ihn beim nächsten Laden überall, auch bei allem, was schon gespielt ist. Abmelden kannst du dort auch. ([#399](https://github.com/christried/compies/issues/399))
- **Darstellung:** Auf der Profil-Seite wählst du jetzt zwischen Hell, Dunkel und System. Die Seite wechselt sofort, und deine Wahl gilt auf jedem Gerät, auf dem du angemeldet bist, ab dem nächsten Laden. Mit System folgt Compies deinem Gerät, auch wenn es abends auf dunkel umschaltet. Wer nichts wählt, bleibt bei Hell. ([#404](https://github.com/christried/compies/issues/404))

### Geändert

- **Datenschutzerklärung:** Sie nennt jetzt, was bei Darstellung und Anzeigename gespeichert wird: Deine Darstellung (Hell, Dunkel oder System) liegt bei deinem Nutzerkonto, ein Cookie merkt sie auf dem Gerät, solange sie Dunkel oder System ist, und deinen Anzeigenamen kannst du jederzeit ändern. ([#405](https://github.com/christried/compies/issues/405))
- Gibt es ein Team nicht mehr, weil der Host die Anzahl Teams gesenkt hat, sagt das Spielbrett jetzt „Dieses Team gibt es nicht mehr.“ Ohne laufende Session nennen „Nächstes Spiel setzen“ und „Rad drehen“ denselben Grund wie die Meldung: „Es läuft gerade keine Session.“ ([#421](https://github.com/christried/compies/issues/421))
- **Tags in Farbe:** In der Bibliothek trägt jeder Tag eines Spiels jetzt eine eigene Farbe, auf der Spielkarte, auf der Seite des Spiels und im Formular. Derselbe Tag hat überall dieselbe Farbe; nur wenn zwei Tags eines Spiels dieselbe hätten, nimmt der spätere die nächste freie, so dass sich bis zu acht Tags eines Spiels nie eine Farbe teilen. ([#427](https://github.com/christried/compies/issues/427))

## [0.10.1] - 2026-11-09 – Partyhut

Der Partyhut für das führende Team, schnellere lange Spielelisten und ein Countdown, der auf dem Handy nicht mehr aus dem Bild läuft, dazu Aufräumarbeiten nach dem Review von 0.10, die niemand sieht.

### Neu

- **Partyhut:** Führt dein Team die Tabelle an, trägt die App-Figur oben in der Kopfzeile eines Events jetzt einen Partyhut, auch bei Gleichstand an der Spitze und nach dem Event bei den Siegern. Der Hut hüpft kurz auf, wenn ein Ergebnis dein Team nach vorn bringt, und ist wieder weg, sobald ein anderes Team vorbeizieht oder ein Ergebnis korrigiert wird; bei reduzierter Bewegung erscheint er ohne Hüpfer. Auf der Startseite und den anderen Seiten bleibt die App-Figur ohne Hut. ([#38](https://github.com/christried/compies/issues/38))

### Geändert

- **Lange Spielelisten laden schneller:** In der Bibliothek, beim Füllen des Spielepools und bei „Nächstes Spiel setzen“ zeigt die Liste zuerst 40 Spiele und lädt beim Scrollen weitere nach, oder mit „Mehr laden“. Suche und Filter durchsuchen weiter die ganze Bibliothek. ([#369](https://github.com/christried/compies/issues/369))

### Behoben

- **Countdown:** Auf dem Handy wird die Seite bei „Zeit ist um“ nicht mehr breiter als der Bildschirm: Sie lässt sich nicht mehr zur Seite schieben, auch nicht während der Stempel aufschlägt. ([#379](https://github.com/christried/compies/issues/379))

## [0.10.0] - 2026-11-09 – Feinschliff

Feinschliff nach dem ersten Spielabend: Hosts können ein Event löschen, Spiele tragen Tags und Preise, der Countdown hat sein Gesicht bekommen, und zwanzig Kleinigkeiten aus dem Produktions-Check sind erledigt, von der Startseite bis zum Veto ohne Namen.

### Neu

- **Event löschen:** Als Host kannst du ein Event jetzt in der Host-Steuerung unter „Mehr“ löschen, in jeder Phase, nur nicht während eine Session läuft. Nach einer Sekunde Halten ist es für alle sofort weg: Es verschwindet von der Startseite, und wer es offen hat oder seinen Event-Link oder Einladungslink öffnet, sieht „Event gelöscht“. Rückgängig machen lässt es sich nicht. ([#333](https://github.com/christried/compies/issues/333))
- **Tags:** In der Bibliothek kannst du einem Spiel jetzt bis zu acht Tags geben, etwa ein Genre oder „Co-op“: tippen und mit Enter oder Komma bestätigen. Beim Tippen schlägt das Formular die Tags vor, die es schon gibt. Die Karte zeigt bis zu drei Tags, die Spielseite alle. Tags sehen nur Hosts. ([#335](https://github.com/christried/compies/issues/335))
- **Tag-Filter:** In der Bibliothek filterst du die Spiele jetzt nach einem Tag: Im Filter „Tag“ stehen alle Tags, die ein Spiel gerade trägt, und die Suche findet Spiele auch über ihre Tags. Den Filter gibt es auch beim Füllen des Spielepools und bei „Nächstes Spiel setzen“. In der Bibliothek steht der gewählte Tag in der Adresse, Neuladen und Zurück behalten ihn. Tags sehen nur Hosts. ([#336](https://github.com/christried/compies/issues/336))
- **Preise:** In der Bibliothek kannst du zu einem Spiel jetzt einen Preis eintragen: den Betrag in Euro und wo es das Spiel gibt, etwa bei Steam, bei GOG oder als Free-to-play. Die App merkt sich den Tag, an dem der Preis geprüft wurde, und mit „Preis stimmt noch“ frischst du ihn mit einem Tipp auf. Karte, Spielseite und die Auswahl für den Spielpool zeigen den Preis. ([#337](https://github.com/christried/compies/issues/337))
- **Preise für Mitglieder:** Unter jedem Spiel siehst du jetzt, was es kostet und wo es das gibt, etwa „19,99 € bei Steam · Stand 3. Nov.“, damit du es vor dem Spielabend besorgen kannst: in „So wird gespielt“, sobald der Host den Spielepool zeigt, auf der Karte des Spiels, das gerade dran ist, und im Spielverlauf. Den Preis siehst du nie früher als den Namen des Spiels, bei verdecktem Rad also erst nach dem Stopp. ([#338](https://github.com/christried/compies/issues/338))

### Geändert

- **Countdown:** Der Countdown hat ein neues Gesicht: ein großer Zeitblock, der in den letzten zehn Sekunden von Gelb auf Rot wechselt und bei Null „Zeit ist um“ stempelt; bei reduzierter Bewegung ohne Bewegung. ([#340](https://github.com/christried/compies/issues/340))
- **Glücksrad-Karte:** Die Karte des Glücksrads zeigt nicht mehr, wie viele Spiele auf dem Rad liegen; Screenreader lesen die Zahl weiter vor. ([#354](https://github.com/christried/compies/issues/354))
- **Clip-Fenster:** Im Clip-Fenster klebt „läuft für alle“ nicht mehr als Pille über dem Video; der Host sieht den Status jetzt unten neben „Clip überspringen“, alle anderen sehen nur das Video. ([#356](https://github.com/christried/compies/issues/356))
- **Bald verfügbar:** Im Setup steht bei Optionen, die noch nicht wählbar sind, jetzt fett „Bald verfügbar“ mit Schloss unter dem Titel statt in einer Pille. ([#350](https://github.com/christried/compies/issues/350))
- **Spielepool-Picker:** Beim Zusammenstellen des Spielepools und bei „Nächstes Spiel setzen“ sitzen die Plus-Knöpfe aller Spielkarten einer Reihe jetzt auf einer Höhe, unten an der Karte. ([#351](https://github.com/christried/compies/issues/351))
- **Zurück-Link:** Der Zurück-Link oben auf Impressum, Datenschutzerklärung, Neuigkeiten, in der Bibliothek und nach dem Anlegen eines Events ist jetzt größer und kräftiger, und das kleine „Geschafft“ über dem Titel nach dem Anlegen ist weg. ([#353](https://github.com/christried/compies/issues/353))
- **Startseite:** Die Begrüßung „Hallo …“ ist weg, und die Event-Karten sehen aus wie im Entwurf: Name, Phase, Host, der beste oder feste Termin, wie viele vollständig abgestimmt haben und ein Knopf je nach Rolle („Öffnen“, „Abstimmen“, „Ansehen“). ([#347](https://github.com/christried/compies/issues/347))
- **Terminumfrage:** Die Umfrage und die Session-Karte zählen jetzt, wer vollständig abgestimmt hat („2 von 3 haben vollständig abgestimmt“). Wer nur auf einen Teil der Termine geantwortet hat, zählt noch nicht. ([#352](https://github.com/christried/compies/issues/352))
- **CSV-Export:** „Als CSV exportieren“ in „Wer kann wann?“ gibt es nur noch für den Host. ([#352](https://github.com/christried/compies/issues/352))
- **Session-Karte:** Verschieben, Neue Terminsuche, Entfernen und der Kalender stecken jetzt hinter einem „Mehr“-Knopf am Ende der Zeile, damit jede Session am Desktop in einer Zeile Platz hat. Die Anmerkungen zu einem Termin sind eingeklappt; die Überschrift zeigt, wie viele es sind. ([#349](https://github.com/christried/compies/issues/349))
- **Seitenleisten und Sheets:** Einladen, Host-Steuerung, Kalender, Ergebnis eintragen und alle anderen Seitenleisten und Sheets gleiten jetzt ein und wieder aus, statt sofort zu erscheinen; bei reduzierter Bewegung blenden sie nur ein und aus. ([#348](https://github.com/christried/compies/issues/348))
- **Veto ohne Namen:** Wer aus einem Team das Veto eingelegt hat, erfährt niemand mehr, auch das eigene Team nicht. Das Veto-Fenster, das Aufdecken und die Aktivität nennen nur die Partei („Veto von Team Orange“), und die Sperre am Veto-Knopf sagt „Team Rot hat schon ein Veto eingelegt“. ([#355](https://github.com/christried/compies/issues/355))
- **Datenschutzerklärung:** Die Datenschutzerklärung beschreibt jetzt, was beim Löschen eines Events passiert: Es ist für alle Mitglieder sofort nicht mehr erreichbar, seine Daten bleiben als gelöscht markiert gespeichert und werden auf Anfrage aus der Datenbank entfernt. ([#334](https://github.com/christried/compies/issues/334))

## [0.9.0] - 2026-11-08 – Siegerehrung

Jetzt gibt es die Siegerehrung: Der Host eröffnet sie im beendeten Event, alle sehen im selben Moment dieselbe Show mit Pokal-Lauf, Stempel und Konfetti, und das Ergebnis gibt es als Bild zum Teilen.

### Neu

- **Siegerehrung starten:** Der Host kann ein beendetes Event mit „Siegerehrung starten“ in der Host-Steuerung eröffnen. Alle, die das Event offen haben, sehen im selben Moment eine Ebene mit dem Endstand, dem Sieger und seinen Leuten, auch wer erst mittendrin dazukommt. ([#309](https://github.com/christried/compies/issues/309))
- In der Siegerehrung tanzt die App-Figur jetzt am Ende; bei reduzierter Bewegung hält sie stattdessen die Jubel-Pose. ([#311](https://github.com/christried/compies/issues/311))
- **Pokal-Lauf:** Die Siegerehrung läuft jetzt als Show: Das Banner fällt herein, die Plätze rutschen von hinten nach vorn ein, und die App-Figur rennt mit dem Pokal herein, stolpert oder bekommt ihn auf den Kopf. Dann landet der Pokal beim Sieger, „SIEGER“ wird gestempelt, Konfetti fliegt, die Leute des Siegers springen ins Bild und die Figur tanzt. Wer später dazukommt, steigt dort ein, wo die Show gerade ist. Mit „Überspringen“ springst du für dich allein zum Endbild; bei reduzierter Bewegung siehst du gleich das Endbild. ([#312](https://github.com/christried/compies/issues/312))
- **Ergebnis-Bild:** Im beendeten Event kannst du mit „Bild teilen“ das Ergebnis als Bild holen, im Querformat oder als Quadrat: mit dem Sieger, der Tabelle und den gespielten Spielen. Du lädst es herunter oder schickst es auf dem Handy direkt an eine andere App. Das Bild gibt es nur für alle, die im Event sind; einen öffentlichen Link dazu gibt es nicht. ([#313](https://github.com/christried/compies/issues/313))
- **Siegerehrung nochmal ansehen:** Hat der Host die Siegerehrung einmal gestartet, kannst du sie im beendeten Event jederzeit noch einmal anschauen: mit „Siegerehrung ansehen“ oben auf der Seite oder mit „Nochmal ansehen“ am Ende der Show. Sie läuft nur bei dir, mit demselben Gag wie beim letzten Start, und von allein startet sie nie. Startet der Host sie neu, springt deine Ansicht zur gemeinsamen Show. ([#314](https://github.com/christried/compies/issues/314))
- **Siegerehrung bei Unentschieden:** Endet ein Event unentschieden, stehen alle Sieger zusammen auf Platz 1: Der Pokal hüpft von Sieger zu Sieger, jeder bekommt sein „SIEGER“, und die Leute jeder siegreichen Partei erscheinen. ([#315](https://github.com/christried/compies/issues/315))
- **Ergebnis-Bild bei Unentschieden:** Endet ein Event unentschieden, zeigt das Bild alle Sieger mit eigener Teamfarbe, und ein Spiel mit mehreren Erstplatzierten bekommt ein gestreiftes Kapselchen statt des Punkts. ([#315](https://github.com/christried/compies/issues/315))

### Geändert

- Die Datenschutzerklärung beschreibt jetzt das Ergebnis-Bild: was es zeigt, dass Compies es nicht speichert und was beim Teilen an eine andere App passiert; außerdem, dass wir speichern, wann der Host zuletzt die Siegerehrung gestartet hat. ([#313](https://github.com/christried/compies/issues/313))

### Behoben

- Lädst du die Event-Seite neu, während das Glücksrad dreht, die Münze fliegt oder ein Countdown läuft, zeigt dein Gerät das Ende nicht mehr zu früh an, wenn seine Uhr vorgeht. ([#287](https://github.com/christried/compies/issues/287))
- Wenn beim Beenden eines Events die Antwort verloren geht und du es noch einmal versuchst, zeigt die Seite keine Fehlermeldung mehr, sondern das beendete Event. ([#288](https://github.com/christried/compies/issues/288))

## [0.8.0] - 2026-11-05 – Punkte

Jetzt zählen die Punkte: Der Host trägt nach jedem Spiel das Ergebnis ein, alle sehen die Tabelle live mitlaufen, und am Ende schließt der Host das Event ab, mit einem Sieger oder unentschieden.

### Neu

- Beim Einrichten und in den Einstellungen sagt dir die App jetzt, wenn ein Event unentschieden enden kann (bei gerader Spielzahl oder mehr als zwei Teams). Dann entscheidest du, ob es unentschieden endet oder ein letztes Spiel dazukommt. Die Empfehlung für den Spielepool zählt dieses mögliche letzte Spiel mit, und beim Glücksrad erinnert dich ein Hinweis daran, für Bonus-Vetos ein paar Spiele mehr einzuplanen. ([#279](https://github.com/christried/compies/issues/279))
- Als Host trägst du jetzt das Ergebnis eines Spiels ein: Beim offenen Spiel drückst du „Ergebnis eintragen“, ordnest die Parteien per Ziehen oder mit den Pfeil-Buttons, markierst „gleichauf“, wenn ein Spiel unentschieden ausging, und kannst pro Partei einen Score dazuschreiben. Die Punkte nach eurer Punktetabelle siehst du vor dem Speichern. Das Spiel bekommt seine Nummer („Spiel 3“), verlässt die offenen Spiele, und die Aktivität nennt, wer gewonnen hat. Ergebnisse trägst du in beliebiger Reihenfolge ein, auch zwischen zwei Sessions. Alle anderen lesen unter jedem offenen Spiel, dass der Host das Ergebnis einträgt. ([#273](https://github.com/christried/compies/issues/273))
- Alle im Event sehen jetzt die Tabelle: im neuen Tab „Tabelle“ (am Handy zwischen „Event“ und „Aktivität“, am Desktop im Seitenpanel) und, sobald das erste Ergebnis eingetragen ist, auch auf der Event-Seite unter den offenen Spielen. Sie zählt nur die Punkte; Parteien mit gleich vielen Punkten teilen sich den Rang („1.“ zweimal) und stehen in Team-Reihenfolge. Darunter zeigt der Spielverlauf jedes gespielte Spiel mit Nummer, Siegern und Scores und klappt auf, wie alle Parteien abgeschnitten haben; offene Spiele stehen gestrichelt darin. ([#274](https://github.com/christried/compies/issues/274))
- Der Host kann jetzt jedes eingetragene Ergebnis korrigieren, solange das Event nicht beendet ist: In der Tabelle öffnet der Stift an einem Spiel das Ergebnis-Fenster mit den gespeicherten Plätzen und Scores, ohne Rückfrage. Das Spiel behält seine Nummer und trägt danach „korrigiert“, die Tabelle rechnet neu, und die Aktivität sagt, welches Spiel korrigiert wurde. Wer ohne Änderung speichert, ändert nichts. Zurückziehen lässt sich ein Ergebnis nicht. ([#275](https://github.com/christried/compies/issues/275))
- Der Host schließt das Event jetzt ab: Sind alle Spiele gespielt und steht ein Sieger fest, hält er im Dock „Event abschließen“. Das beendet die laufende Session, entfernt die Sessions, die noch nicht angefangen haben, und schließt die Terminumfrage. Danach ist das Event für alle nur noch zum Ansehen da, auch für den Host, mit der Tabelle, dem Spielverlauf und der Aktivität; der Einladungslink funktioniert weiter. Wer früher aufhören will, senkt zuerst die Anzahl der Spiele auf die gespielten. ([#277](https://github.com/christried/compies/issues/277))
- Steht nach dem letzten Spiel mehr als eine Partei auf Platz 1, entscheidet der Host im Dock: „Unentschieden beenden“ (halten) beendet das Event mit allen Parteien auf Platz 1 als Siegern, „Letztes Spiel hinzufügen“ erhöht die Anzahl der Spiele um eins, und alle Parteien spielen dieses Spiel wie jedes andere. Steht danach wieder mehr als eine Partei vorn, kommt dieselbe Wahl noch einmal; mehr als die erlaubte Anzahl an Spielen geht nicht, „Unentschieden beenden“ geht immer. Alle anderen lesen bis dahin „Gleichstand auf Platz 1. Der Host entscheidet.“ Endet das Event unentschieden, steht „Unentschieden“ als Überschrift der Event-Seite, und die Aktivität nennt alle Parteien auf Platz 1. ([#278](https://github.com/christried/compies/issues/278))
- Die Tabelle bewegt sich jetzt, wenn ein Ergebnis eintrifft oder korrigiert wird: Die Zeilen gleiten in die neue Reihenfolge, die Punkte zählen hoch, und jede Partei bekommt eine Pille mit ihren neuen Punkten. Auf der Event-Seite bekommen außerdem die Sieger des Spiels einen Stempel und Konfetti. Es passiert nur für ein Ergebnis, das du live siehst, nie beim Öffnen der Seite; bei reduzierter Bewegung springen die Zeilen mit einer kurzen Hervorhebung, es gibt kein Konfetti, und Screenreader hören die neue Reihenfolge. ([#276](https://github.com/christried/compies/issues/276))

### Geändert

- Ist auf dem Rad kein Spiel mehr, sagt dir der Host-Button „Neu drehen“ jetzt, dass du mit „Nächstes Spiel setzen“ eines aus der Bibliothek setzen kannst. ([#261](https://github.com/christried/compies/issues/261))
- Offene Spiele zeigt die Event-Seite jetzt auch zwischen zwei Sessions, nicht nur während eine läuft. ([#273](https://github.com/christried/compies/issues/273))
- Das Fenster „Ergebnis eintragen“ sagt jetzt über dem Spiel, das wievielte Spiel es wird, zum Beispiel „Spiel 3 von 6“. ([#274](https://github.com/christried/compies/issues/274))
- Ein Event, dessen Sessions alle vorbei sind, das der Host aber noch nicht abgeschlossen hat, zeigt oben jetzt „Kein Termin“ statt „Vorbei“. „Beendet“ steht erst nach dem Abschließen. ([#277](https://github.com/christried/compies/issues/277))
- Ein laufendes Event mit Ergebnissen bleibt auf der Startseite, bis der Host es abschließt, auch wenn die letzte Session schon länger vorbei ist. Ein abgeschlossenes Event verschwindet einen Tag nach dem Abschluss von dort. ([#282](https://github.com/christried/compies/issues/282))
- Die Datenschutzerklärung beschreibt jetzt auch die Runden eines Events: die gezogenen und gesetzten Spiele, die Ergebnisse und die Tabelle, Vetos, Bonus-Vetos und Münzwürfe, außerdem, wann der Host ein Event abgeschlossen hat. Den Tiebreaker-Pool nennt sie nicht mehr. ([#280](https://github.com/christried/compies/issues/280))

### Behoben

- Steht eine Zahl auf eins, folgt ihr jetzt die Einzahl: „1 Person da“ auf dem Board, „1 Spiel durchsuchen“ in der Bibliothek und „schon 1 Veto eingesetzt“ in den Einstellungen. ([#268](https://github.com/christried/compies/issues/268))
- Als Host siehst du in den Einstellungen die Sperre von „Rad verdecken“ und den Vetos nicht mehr, wenn das Spiel schon feststeht. ([#261](https://github.com/christried/compies/issues/261))
- Überspringt der Host den Clip, blenden ihn alle anderen jetzt aus, statt dass er plötzlich verschwindet. ([#261](https://github.com/christried/compies/issues/261))
- Ein sehr langer Spielname im Spielepool macht die Event-Seite am Handy nicht mehr breiter als den Bildschirm. ([#279](https://github.com/christried/compies/issues/279))
- Wenn ein Spiel zurückgelegt wird, rutscht die Seite darunter jetzt sanft nach oben statt zu springen. ([#276](https://github.com/christried/compies/issues/276))
- Ein sehr langer Spielname ohne Leerzeichen läuft im Aktivitäts-Feed nicht mehr über den Rand. ([#273](https://github.com/christried/compies/issues/273))
- Am Handy schließt die Leiste mit dem Knopf unten in einem Fenster jetzt bündig mit dem Bildschirmrand ab, statt den Inhalt darunter durchscheinen zu lassen. ([#218](https://github.com/christried/compies/issues/218))

### Entfernt

- Den Tiebreaker-Pool gibt es nicht mehr: Bei Gleichstand auf Platz 1 spielt niemand ein eigenes Tiebreaker-Spiel, du entscheidest als Host. Die Spiele, die in einem Tiebreaker-Pool lagen, sind dort entfernt und bleiben in der Bibliothek. Willst du sie noch spielen, nimm sie in den Spielepool auf (Einstellungen, Schritt „Spielepool“). ([#279](https://github.com/christried/compies/issues/279))

## [0.7.0] - 2026-11-02 – Glücksrad

Das Glücksrad dreht sich jetzt bei allen im selben Moment, mit Clip, versiegelten Vetos und mehreren Spielen gleichzeitig. Dazu wirft der Host eine Münze und stellt einen Countdown.

### Neu

- Der Host setzt in der laufenden Session das nächste Spiel direkt, aus dem Pool oder der ganzen Bibliothek. Mehrere Spiele können gleichzeitig laufen, und ein Spiel lässt sich zurücklegen. ([#228](https://github.com/christried/compies/issues/228))
- Das Glücksrad dreht sich: Der Host dreht, und alle sehen denselben Dreh mit demselben Ergebnis im selben Moment. Beim verdeckten Rad stehen Platzhalter auf dem Rad, bis es stoppt. ([#229](https://github.com/christried/compies/issues/229))
- Der Host kann in der laufenden Session einen Countdown stellen, der bei allen gleichzeitig abläuft, auch für alle, die später dazukommen. ([#236](https://github.com/christried/compies/issues/236))
- Der Host wirft in der laufenden Session eine Münze, die bei allen im selben Moment auf Kopf oder Schwanz landet. ([#235](https://github.com/christried/compies/issues/235))
- Der Clip des Spiels läuft bei allen im selben Moment, ab dem Stopp des Rads oder sobald der Host das Spiel setzt, und wer später kommt, landet an der richtigen Stelle. Der Host kann ihn für alle überspringen. ([#230](https://github.com/christried/compies/issues/230))
- Nach dem Stopp hat jede Partei mit Veto 60 Sekunden, das Spiel abzulehnen. Das Veto bleibt versiegelt, bis alle es im selben Moment sehen; ein abgelehntes Spiel fliegt raus, und das Rad dreht neu. ([#231](https://github.com/christried/compies/issues/231))
- Beim Setzen eines Spiels im Glücksrad lässt sich ein Veto erlauben: Dann haben die Parteien wie nach einem Dreh 60 Sekunden, es abzulehnen. ([#232](https://github.com/christried/compies/issues/232))
- Der Host kann einer Partei ein Bonus-Veto geben, bis zu 9 pro Partei. Sie kann es sofort einsetzen, auch in einem laufenden Veto-Fenster. ([#233](https://github.com/christried/compies/issues/233))
- Wird der Pool während des Events knapp, sieht der Host einen Hinweis auf der Bühne und in den Einstellungen; die anderen merken davon nichts. ([#234](https://github.com/christried/compies/issues/234))

### Geändert

- Als Host kannst du „Rad verdecken“ und die Vetos pro Partei nicht mehr ändern, solange ein Spiel gezogen wird. ([#231](https://github.com/christried/compies/issues/231))
- Als Host kannst du die Anzahl der Spiele nicht mehr unter die Spiele senken, die schon gestartet sind. ([#228](https://github.com/christried/compies/issues/228))
- Unter der Bench steht jetzt „Noch ohne Team, unbegrenzt“ statt „Ersatz, unbegrenzt“. ([#238](https://github.com/christried/compies/issues/238))
- Mit reduzierter Bewegung blendet sich ein verschobenes Mitglied am neuen Platz ein, statt dorthin zu gleiten. ([#237](https://github.com/christried/compies/issues/237))

### Behoben

- Schlägt schon die erste Verbindung fehl, zeigt die Event-Seite jetzt den Hinweis zur Verbindung. ([#238](https://github.com/christried/compies/issues/238))

## [0.6.0] - 2026-11-01 – Notizen

Spiele bekommen Notizen für Einstellungen und Hausregeln, und als Host entscheidest du, ob die anderen den Spielepool schon vorher sehen.

### Neu

- Spiele in der Bibliothek haben jetzt **Notizen**: Einstellungen, Aufwärmen, Siegbedingung und Hausregeln, bis zu 1000 Zeichen. Wer das Spiel angelegt hat, schreibt sie, auch gleich beim Anlegen im Event-Assistenten; alle Hosts lesen sie auf der Seite des Spiels. ([#223](https://github.com/christried/compies/issues/223))
- Als Host kannst du in „So wird gespielt“ unter jedem Spiel im Pool seine **Notizen** aufklappen. ([#224](https://github.com/christried/compies/issues/224))
- Neue Einstellung **Pool vorher zeigen** bei Host-Wahl und Glücksrad: Ist sie aus, sehen die anderen weder die Spiele im Spielepool und im Tiebreaker-Pool noch, wie viele es sind. Du kannst sie jederzeit ändern, auch während das Event läuft; beim verdeckten Rad ist sie immer aus. ([#225](https://github.com/christried/compies/issues/225))

### Geändert

- Im Spielepool siehst du als Mitglied nur noch Bild und Namen der Spiele; Spielerzahl und Notizen sieht der Host. ([#224](https://github.com/christried/compies/issues/224))
- Die Zusammenfassung im Event-Assistenten und „So wird gespielt“ zeigen die Einstellungen jetzt in denselben Zeilen: „Auswahl“ statt „Modus“, die Spiele mit ihrer Anzahl („10 Spiele“), die Vetos in einer eigenen Zeile und die Punkte zuletzt. ([#225](https://github.com/christried/compies/issues/225))

## [0.5.1] - 2026-11-01 – Neue Nummern

Ein kleines Update ohne neue Funktion: neue Versionsnummern, eine eigene Kontaktadresse, und ein verdecktes Rad verrät noch weniger.

### Geändert

- Die Versionsnummern fangen jetzt bei 0.1 an: Compies ist noch im Aufbau, 1.0 kommt, wenn alles fertig ist. Aus 1.0 bis 1.4 werden 0.1 bis 0.5. ([#220](https://github.com/christried/compies/issues/220))
- Ist das Rad verdeckt, siehst du nicht mehr, wie viele Spiele im Pool sind. Das zeigt dir erst das Rad. ([#222](https://github.com/christried/compies/issues/222))
- Im Impressum und in der Datenschutzerklärung steht jetzt die Kontaktadresse compies@christried.me. ([#221](https://github.com/christried/compies/issues/221))

## [0.5.0] - 2026-10-31 – Teams

Die Event-Seite ist jetzt live: Ihr seht, wer gerade da ist, setzt euch auf dem Spielbrett in Teams, gebt eurem Team gemeinsam einen Namen, und der Host startet die Sessions. Unter **Aktivität** steht, was im Event passiert ist.

### Neu

- Die Event-Seite aktualisiert sich jetzt von selbst: Was andere tun, siehst du sofort. Bricht die Verbindung ab, zeigt dir ein Hinweis oben, wann sie wieder steht. ([#156](https://github.com/christried/compies/issues/156))
- Unter **Aktivität** siehst du jetzt, was im Event passiert ist: wer dazugekommen ist, wann ein Termin feststand und was der Host geändert hat. ([#159](https://github.com/christried/compies/issues/159))
- Auf der Event-Seite gibt es jetzt das **Spielbrett**: Zieh dich in ein Team, auf die Bench oder auf die Tribüne. Die Teamwahl öffnet, sobald ein Termin steht, und alle sehen sofort, wer wo sitzt. ([#160](https://github.com/christried/compies/issues/160))
- Auf dem Spielbrett siehst du jetzt, wer gerade online ist. ([#162](https://github.com/christried/compies/issues/162))
- Jedes Team bekommt jetzt seinen eigenen Namen: Alle im Team geben ein Wort ab, in der Reihenfolge, in der ihr beigetreten seid. ([#161](https://github.com/christried/compies/issues/161))
- Der Host startet und beendet jetzt die Sessions. Mit dem ersten Start sind die Teams gesperrt und die Teamnamen eingefroren. Läuft schon eine Session, könnt ihr für den Termin der nächsten weiter abstimmen. ([#164](https://github.com/christried/compies/issues/164))
- Nach einer neuen Version zeigt dir Compies einmal, was neu ist. Das gilt für dein Konto: Hast du es auf einem Gerät gesehen, kommt es auf den anderen nicht noch einmal. ([#184](https://github.com/christried/compies/issues/184))

### Geändert

- Die Event-Seite ist neu sortiert: Oben steht immer, was gerade dran ist. Die Aktivität hat ihren eigenen Platz, am Rechner rechts daneben, am Handy als eigener Tab. ([#166](https://github.com/christried/compies/issues/166))
- In der Host-Steuerung siehst du jetzt nur die wichtigsten Aktionen. Alles Weitere, etwa Termine bearbeiten und Einstellungen, findest du unter **Mehr**. ([#155](https://github.com/christried/compies/issues/155))
- Die Teamgröße geht in den Einstellungen nicht mehr unter das vollste Team. Wenn du Teams entfernst, gehen ihre Leute auf die Bench. ([#163](https://github.com/christried/compies/issues/163))
- Die Datenschutzerklärung beschreibt jetzt auch das Spielbrett, den Aktivitäts-Feed, die Live-Verbindung und „Was ist neu“. ([#153](https://github.com/christried/compies/issues/153))
- Ein Event bleibt jetzt auf der Startseite, bis alle seine Sessions gespielt sind, auch wenn ihr Termin schon vorbei ist. Einen Tag nach dem Ende der letzten Session verschwindet es von dort. ([#199](https://github.com/christried/compies/issues/199))

## [0.4.0] - 2026-10-29 – Spielvorbereitung

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

## [0.3.0] - 2026-10-28 – Mehr Termine

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

## [0.2.2] - 2026-10-24 – Angemeldet bleiben

### Behoben

- Du bleibst angemeldet, solange du die App mindestens einmal pro Woche nutzt. Bisher wurdest du nach 7 Tagen abgemeldet. ([#64](https://github.com/christried/compies/issues/64))
- Läuft deine Anmeldung ab oder meldest du dich in einem anderen Tab ab, landest du auf der Anmeldeseite und danach wieder dort, wo du warst, statt bei einer Fehlermeldung. ([#66](https://github.com/christried/compies/issues/66))

## [0.2.1] - 2026-10-24 – Tab-Titel

### Behoben

- Der Titel des Browser-Tabs zeigt jetzt, wo du gerade bist: bei einer Einladung, beim Anmelden und auf Fehlerseiten. ([#10](https://github.com/christried/compies/issues/10))

## [0.2.0] - 2026-10-24 – Feinschliff

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

## [0.1.0] - 2026-10-22 – Terminfindung

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
