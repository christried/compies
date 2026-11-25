import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserMenu from '~/components/UserMenu.vue'
import ImpressumPage from '~/pages/impressum.vue'
import DatenschutzPage from '~/pages/datenschutz.vue'
import { kitty, signInAs } from './auth'
import { shownToasts } from './event-page'

// The back link reads the in-app history entry at click time; a direct visit has none.
const setHistoryBack = (back: string | null) => window.history.replaceState({ ...window.history.state, back }, '')
const backLink = (page: VueWrapper) => page.findAll('a').find(a => a.text().includes('Zurück'))!

describe('legal pages', () => {
  beforeEach(() => signInAs(null))

  it('render the Impressum signed out, in the bare shell', async () => {
    const page = await mountSuspended(ImpressumPage, { route: '/impressum' })

    expect(page.get('h1').text()).toBe('Impressum')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(false)
    expect(page.get('main').text()).toContain('Dominik Christian Gilges')
    expect(page.get('main').text()).toContain('compies@christried.me')
  })

  it('render the Datenschutzerklärung signed out, in the bare shell', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    expect(page.get('h1').text()).toBe('Datenschutzerklärung')
    expect(page.find('nav[aria-label="Hauptnavigation"]').exists()).toBe(false)
    expect(page.get('main').text()).toContain('Discord')
    expect(page.get('main').text()).toContain('Twitch')
  })

  it('name the YouTube player and the Cloudflare R2 image storage', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    expect(page.get('main').text()).toContain('YouTube')
    expect(page.get('main').text()).toContain('youtube-nocookie')
    expect(page.get('main').text()).toContain('Cloudflare')
  })

  it('tell in the image and YouTube sections that Members see a game drawn or set in their Event, and the pools\' games before only while the Host shows them the pools (#225, review 0.7)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    const text = page.get('main').text()
    const shown = 'solange der Host ihnen die Pools vorher zeigt (Einstellung „Pool vorher zeigen“; bei verdecktem Rad nie).'
    expect(text.split(shown)).toHaveLength(3)
    expect(text).toContain('außerdem Mitglieder eines Events, sobald das Spiel dort gezogen oder gesetzt ist')
    expect(text).toContain('Vorschaubilder sehen Mitglieder eines Events von jedem Spiel, sobald es gezogen oder gesetzt ist')
    expect(text).toContain('und vorher, wenn der Spielepool des Events das Spiel enthält, solange der Host ihnen die Pools vorher zeigt')
    expect(text).toContain('von den Spielen im Spielepool, solange der Host ihnen die Pools vorher zeigt')
    expect(text).not.toContain('solange das Rad nicht verdeckt ist')
  })

  it('say in the events section that only the owning Host reads a game\'s notes and only the Event\'s Host its Event notes, and who sees a game image (#735, 0.16)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    const text = page.get('main').text()
    expect(text).toContain('Die Notizen eines Spiels liest und ändert nur der Host, in dessen Bibliothek es liegt, die Notizen für ein Event nur der Host dieses Events; andere Hosts, Admins und die Mitglieder eines Events sehen sie nicht.')
    expect(text).toContain('Sehen darf ein Bild der Host, in dessen Bibliothek das Spiel liegt,')
    expect(text).toContain('Andere Hosts und Admins sehen es nicht.')
    expect(text).not.toContain('gemeinsame Spielebibliothek')
    expect(text).not.toContain('Lesen können sie Personen mit Host-Berechtigung und Admins')
  })

  it('name the Rounds, Vetoes, coin tosses and Results, who sees them and how long they stay (#280, spec #272)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const sections = page.findAll('section')
    const events = sections.find(s => s.get('h2').text() === '11. Events, Terminvorschläge und Stimmen')
    const retention = sections.find(s => s.get('h2').text() === '16. Speicherdauer')

    expect(events).toBeDefined()
    expect(retention).toBeDefined()
    expect(events!.text()).toContain('Zu jeder Runde eines Events speichern wir das gezogene oder gesetzte Spiel und, sobald der Host es einträgt, das Ergebnis: die Platzierung jedes Teams und, wenn angegeben, seinen Score. Zu jedem Veto speichern wir, welches Team es eingelegt hat und wer aus dem Team, zu jedem Bonus-Veto, welches Team es bekam, und zu jedem Münzwurf, wer geworfen hat.')
    expect(events!.text()).toContain('Zum Event selbst speichern wir, wann der Host es abgeschlossen hat und wann er zuletzt die Siegerehrung gestartet hat.')
    expect(events!.text()).toContain('und wer einen Teamnamen zurückgesetzt hat, welche Spiele gezogen, gesetzt oder zurückgelegt wurden, welches Team ein Veto eingelegt hat, welches Team ein Bonus-Veto bekam, wie ein Münzwurf ausging, welche Ergebnisse eingetragen oder korrigiert wurden und wie das Event endete.')
    expect(events!.text()).toContain('das Spielbrett mit Plätzen, Teamwörtern und Teamnamen, die Runden mit ihren Ergebnissen, die Tabelle und der Aktivitäts-Feed sowie Anzeigename, Profilbild, Stimmen und Anmerkungen ihrer Mitglieder sind für alle Mitglieder dieses Events sichtbar. Dass ein Team ein Veto eingelegt hat, sieht bis zum Aufdecken nur dieses Team; welcher Spieler es war, erfährt niemand.')
    expect(retention!.text()).toContain('Plätze, Teamwörter, Runden mit ihren Vetos und Ergebnissen, Münzwürfe und der Aktivitäts-Feed eines Events bleiben gespeichert, solange das Event besteht.')
    expect(page.get('main').text()).not.toContain('Tiebreaker')
  })

  it('keep the Tribüne and the open Team names of the 0.12 storage: the feed holds each Team name, a Teamwort stays in its entries, no name is frozen (#446, ADR 0016)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const sections = page.findAll('section')
    const events = sections.find(s => s.get('h2').text() === '11. Events, Terminvorschläge und Stimmen')
    const retention = sections.find(s => s.get('h2').text() === '16. Speicherdauer')
    const live = sections.find(s => s.get('h2').text().includes('Live-Verbindung'))

    expect(events!.text()).toContain('wo du sitzt (Tribüne oder ein Team), seit wann du in deinem Team bist und dein Teamwort, wenn du eins abgibst.')
    expect(events!.text()).toContain('Zu jeder Session speichern wir, wann der Host sie gestartet und beendet hat. Zu jeder Runde')
    expect(events!.text()).toContain('Zu jedem Eintrag, der ein Team nennt, speichert der Feed den Namen, den das Team in diesem Moment hatte, und damit die Teamwörter darin. Dein Teamwort bleibt in diesen Einträgen deshalb stehen, solange das Event besteht, auch wenn du dein Team verlässt oder dein Teamwort änderst.')
    expect(retention!.text()).toContain('Ein Teamwort wird gelöscht, sobald du dein Team verlässt; im aktuellen Namen des Teams steht es dann nicht mehr. Ausgenommen sind die Einträge des Aktivitäts-Feeds: Sie behalten den Teamnamen von damals, das Wort bleibt dort, solange das Event besteht (Abschnitt 11).')
    expect(live!.text()).toContain('das Zurücksetzen von Teamnamen, Start und Ende einer Session')
    // The one place a frozen name is named: Events finished before 0.12 keep the name frozen at their first Session's start (#446, Spec F1).
    expect(retention!.text()).toContain('Abschnitt 11). In Events, die vor Version 0.12 abgeschlossen wurden, bleibt außerdem der Teamname gespeichert, der beim Start der ersten Session eingefroren wurde, mit den Teamwörtern darin, solange das Event besteht.')
    const text = page.get('main').text().replace('der beim Start der ersten Session eingefroren wurde', '')
    expect(text).not.toContain('Bench')
    expect(text).not.toContain('eingefroren')
    expect(text).not.toContain('Einfrieren')
  })

  it('name the result picture of a finished Event: what it shows, that it is not stored, and the share target (#313, spec #308, #445, #446)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const events = page.findAll('section').find(s => s.get('h2').text() === '11. Events, Terminvorschläge und Stimmen')

    expect(events!.text()).toContain('Ist ein Event abgeschlossen und die Siegerehrung gestartet, kann jedes Mitglied ein Ergebnisbild herunterladen oder teilen. Es zeigt Namen und Datum des Events, wie viele Leute mitgespielt haben, die Tabelle mit Teamnamen und Punkten und die gespielten Spiele, aber keine Anzeigenamen und keine Profilbilder. Compies erzeugt das Bild bei jedem Abruf neu und speichert es nicht. Teilst du es über die Teilen-Funktion deines Geräts, gibt dein Gerät es an die App weiter, die du wählst; ab dann gelten deren Datenschutzbestimmungen.')
  })

  it('say what deleting an Event means: unreachable for every Member at once, data kept until removed on request, no automatic purge (#334, spec #332)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const sections = page.findAll('section')
    const events = sections.find(s => s.get('h2').text() === '11. Events, Terminvorschläge und Stimmen')
    const retention = sections.find(s => s.get('h2').text() === '16. Speicherdauer')

    expect(events!.text()).toContain('Der Host kann ein Event jederzeit löschen, nur nicht, solange eine Session läuft. Ein gelöschtes Event ist für alle Mitglieder sofort nicht mehr erreichbar: nicht auf der Startseite, nicht über den Link zum Event und nicht über den Einladungslink. Dort steht dann nur, dass das Event gelöscht wurde.')
    expect(retention!.text()).toContain('Die Daten eines gelöschten Events bleiben zunächst gespeichert, als gelöscht markiert, aber in Compies für niemanden mehr abrufbar. Auf Anfrage an die unter Abschnitt 1 genannte Adresse entfernen wir sie aus der Datenbank. Eine automatische Löschung gibt es nicht.')
    expect(retention!.text()).toContain('bleiben gespeichert, solange das Event besteht.')
  })

  it('name the Member a Host removes in the Activity feed entry of section 11 and what a removal deletes and keeps in section 16, word for word (#899, spec #894)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const sections = page.findAll('section')
    const events = sections.find(s => s.get('h2').text() === '11. Events, Terminvorschläge und Stimmen')
    const retention = sections.find(s => s.get('h2').text() === '16. Speicherdauer')

    expect(events!.text()).toContain('Er hält fest, wer wann beigetreten ist, wen der Host aus dem Event entfernt hat, wer den Platz gewechselt hat oder von wem verschoben wurde,')
    expect(retention!.text()).toContain('Entfernt ein Host einen Terminvorschlag, werden die Stimmen und Anmerkungen dazu mitgelöscht. Entfernt der Host dich aus einem Event, werden deine Mitgliedschaft mit Platz und Teamwort sowie deine Stimmen und Anmerkungen in diesem Event gelöscht. Deine Nachrichten im Chat und die Einträge des Aktivitäts-Feeds, die dich nennen, bleiben gespeichert, solange das Event besteht.')
  })

  it('name the Chat and the Emotes: what is stored, who reads it, how a delete works, what the room keeps and that no Emote is stored (#775, spec #719)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const sections = page.findAll('section')
    const sectionText = (heading: string) => sections.find(s => s.get('h2').text().startsWith(heading))!.text()

    expect(sectionText('4.')).toContain('Stimmen und Anmerkungen, die Nachrichten im Chat eines Events, die Spiele in der Bibliothek jedes Hosts')
    expect(sectionText('10.')).toContain('(z. B. Anmeldeversuche, Abstimmungen oder Nachrichten im Chat)')
    expect(sectionText('10.')).toContain('Einen solchen Zähler führt auch die Live-Verbindung für Emotes (Abschnitt 21).')

    const events = sectionText('11.')
    expect(events).toContain('Jedes Event hat einen Chat. Jedes Mitglied, auch auf der Tribüne, kann dort Nachrichten mit bis zu 500 Zeichen schreiben, bis das Event abgeschlossen ist; danach bleibt der Chat lesbar. Zu jeder Nachricht speichern wir ihren Text, wer sie geschrieben hat und wann.')
    expect(events).toContain('Im Aktivitäts-Feed stehen sie nicht.')
    expect(events).toContain('können sie jederzeit löschen, auch nach dem Abschluss des Events. Ihr Text wird dann entfernt, und im Chat bleibt eine Zeile, die zeigt, dass die Nachricht gelöscht wurde und ob der Host oder die Person selbst sie gelöscht hat.')
    expect(events).toContain('Compies ruft sie nicht selbst ab und zeigt keine Vorschau.')
    expect(events).toContain('Emotes, die Mitglieder auf dem Spielbrett senden, speichert Compies nicht (Abschnitt 21).')

    const retention = sectionText('16.')
    expect(retention).toContain('Die Nachrichten des Chats bleiben ebenfalls gespeichert, solange das Event besteht. Löschst du eine Nachricht oder löscht der Host sie, wird ihr Text sofort in der Datenbank überschrieben und ist in Compies nirgends mehr gespeichert;')
    expect(retention).toContain('Auf einem Gerät, das die Löschung nicht sofort erreicht, bleibt der Text bis zum nächsten Laden der Seite sichtbar.')
    expect(retention).toContain('der Text deiner Nachrichten im Chat; deine Stimmen und Anmerkungen;')

    const live = sectionText('21.')
    expect(live).toContain('Auch die Nachrichten des Chats gehen so an die Mitglieder: neue mit ihrem Text und der Person, die sie geschrieben hat, gelöschte nur als Hinweis, dass sie gelöscht wurden.')
    expect(live).toContain('keine Nachrichten des Chats und keine Emotes; er reicht sie nur weiter.')
    expect(live).toContain('Diese Zeitpunkte liegen nur im Arbeitsspeicher des Dienstes, nie in einer Datenbank oder Datei.')
    expect(live).toContain('der Chat holt verpasste Nachrichten nach, sobald die Verbindung wieder steht.')
  })

  it('name the Appearance stored with the User and the changeable Display name in section 6 (#405, spec #398)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const section = page.findAll('section').find(s => s.get('h2').text() === '6. Anmeldung über Discord oder Twitch und Anzeigename')

    expect(section).toBeDefined()
    expect(section!.text()).toContain('Du kannst deinen Anzeigenamen jederzeit auf der Seite „Profil“ ändern. Der neue Name erscheint überall in Compies, auch in dem, was schon geschehen ist, etwa im Aktivitäts-Feed und in den Ergebnissen; einen früheren Anzeigenamen speichern wir nicht.')
    expect(section!.text()).toContain('Ebenso speichern wir zu deinem Nutzerkonto deine Darstellung: Hell, Dunkel oder System (System folgt der Einstellung deines Geräts). Du wählst sie auf der Seite „Profil“; solange du nichts wählst, ist es Hell. Die Wahl gilt auf jedem Gerät, auf dem du dich anmeldest. Wie ein Gerät sie für Seiten ohne Anmeldung behält, steht in Abschnitt 9.')
    expect(section!.findAll('p')).toHaveLength(7)
  })

  it('name the own Profilbild in sections 5, 6 and 7 word for word: where it is stored, who loads it, that a sign-in keeps it (#912, spec #907)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const paragraphs = (heading: string) => page.findAll('section').find(s => s.get('h2').text() === heading)!.findAll('p').map(p => p.text())

    const storage = paragraphs('5. Spielbilder und Profilbilder (Cloudflare R2)')
    const kennung = storage.findIndex(p => p.endsWith('und seine Kennung aus Spiel-ID und einer Zufallsfolge.'))
    expect(kennung).toBeGreaterThanOrEqual(0)
    expect(storage[kennung + 1]).toBe('Lädst du auf der Seite „Profil“ ein eigenes Profilbild hoch, speichern wir es im selben Speicher: das Bild selbst (256 × 256 Pixel, in deinem Browser zugeschnitten; das Original verlässt dein Gerät nicht) und seine Kennung, eine Zufallsfolge ohne Bezug zu dir. Auch dieses Bild reicht unser Server unter /api/images/ an den Browser weiter. Anders als ein Spielbild kann es jeder abrufen, der seine Adresse kennt, auch ohne Anmeldung; die Adresse lässt sich nicht erraten und erscheint nur dort, wo dein Profilbild gezeigt wird (Abschnitt 7). Lädst du ein neues Bild hoch oder entfernst du dein Bild, löschen wir das bisherige sofort aus dem Speicher.')
    expect(storage.at(-1)).toContain('Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung der Spiele in der Bibliothek und in den Events sowie des Profilbilds).')

    const signIn = paragraphs('6. Anmeldung über Discord oder Twitch und Anzeigename').join('\n')
    expect(signIn).toContain('Name und Adresse des Profilbilds werden bei jeder Anmeldung aktualisiert; ein eigenes Profilbild (Abschnitt 7) bleibt davon unberührt.')
    expect(signIn).not.toContain('Name und Profilbild werden bei jeder Anmeldung aktualisiert.')

    const avatar = paragraphs('7. Profilbild')
    expect(avatar).toHaveLength(2)
    expect(avatar[0]).toBe('Neben deinem Anzeigenamen zeigt Compies ein rundes Profilbild: dir selbst, den Mitgliedern der Events, denen du angehörst, und, wenn du Host bist, allen, die einen Einladungslink zu deinem Event öffnen, auch ohne Anmeldung. Es ist das Bild, das du auf der Seite „Profil“ hochgeladen hast, sonst dein Profilbild bei Discord bzw. Twitch, sonst dein Anfangsbuchstabe.')
    expect(avatar[1]).toMatch(/^Ein eigenes Bild liegt bei uns \(Abschnitt 5\) und wird von unserem Server geladen; Discord und Twitch erfahren davon nichts\. Du kannst es jederzeit ersetzen oder entfernen; dann gilt wieder dein Bild bei Discord bzw\. Twitch\. Ohne eigenes Bild wird das Profilbild direkt von den Servern von Discord bzw\. Twitch geladen\. Dabei erhält der jeweilige Dienst /)
  })

  it('say in sections 6, 16 and 18 how a User deletes the account on the Profil page, what goes and what stays, word for word (#920, spec #907)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const paragraphs = (heading: string) => page.findAll('section').find(s => s.get('h2').text() === heading)!.findAll('p').map(p => p.text())

    const signIn = paragraphs('6. Anmeldung über Discord oder Twitch und Anzeigename')
    expect(signIn.at(-1)).toBe('Welche Konten Events anlegen dürfen (Host-Berechtigung), ist als Liste von Discord- und Twitch-Benutzerkennungen fest hinterlegt. Bei jeder Anmeldung wird deine Benutzerkennung mit dieser Liste abgeglichen und die Berechtigung in deinem Nutzerkonto vermerkt. Diese Liste ändert Compies nicht selbst: Löschst du dein Nutzerkonto, bleibt deine Benutzerkennung darin, bis du uns bittest, sie zu entfernen (Abschnitt 16). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse daran, dass nur bekannte Personen Events anlegen).')

    const retention = paragraphs('16. Speicherdauer').at(-1)!
    expect(retention.endsWith('Dein Nutzerkonto löschst du selbst auf der Seite „Profil“ („Konto löschen“); kannst du dich nicht mehr anmelden, genügt eine Nachricht an die unter Abschnitt 1 genannte Adresse. Die Löschung gilt sofort und lässt sich nicht rückgängig machen. Gelöscht werden: dein Name, deine E-Mail-Adresse, dein Anzeigename, dein Profilbild, deine Verknüpfung mit Discord bzw. Twitch und deine Anmeldesitzungen; alle Events, die du als Host angelegt hast, mit allem, was dazugehört, auch für die anderen Mitglieder und auch die abgeschlossenen; deine Bibliothek mit ihren Spielen, Notizen und Bildern (ein Bild erst, wenn keine Kopie eines anderen Hosts es mehr nutzt, Abschnitt 5); der Text deiner Nachrichten im Chat; deine Stimmen und Anmerkungen; dein Teamwort im aktuellen Teamnamen. Es bleibt ein leerer Eintrag ohne Namen, der nur festhält, wann das Konto gelöscht wurde. An ihm hängt, was in Events anderer Hosts nicht dir allein gehört: dein Platz in einem abgeschlossenen Event, die Vetos deines Teams und die Einträge des Aktivitäts-Feeds über dich; statt deines Namens steht dort „Gelöschtes Konto“. Die Einträge des Aktivitäts-Feeds behalten den Teamnamen von damals und damit auch dein Teamwort darin (Abschnitt 11). Aus Events anderer Hosts, die noch nicht abgeschlossen sind, scheidest du aus. Meldest du dich danach wieder an, entsteht ein neues Nutzerkonto ohne Verbindung zum alten. In den Wiederherstellungsdaten unseres Datenbankanbieters (Abschnitt 4) bleiben gelöschte Daten noch bis zu 6 Stunden enthalten.')).toBe(true)
    expect(retention).not.toContain('Wir entfernen dann auch deine Nachrichten im Chat.')

    const rights = paragraphs('18. Deine Rechte')
    expect(rights[0]).toBe('Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO); die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt. Zur Ausübung genügt eine Nachricht an die unter Abschnitt 1 genannte Adresse. Dein Nutzerkonto kannst du außerdem selbst auf der Seite „Profil“ löschen (Abschnitt 16).')
  })

  it('name the compies-appearance cookie in section 9 and move the Stand (#405, spec #398)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const section = page.findAll('section').find(s => s.get('h2').text() === '9. Cookies und Speicher im Browser')

    expect(section).toBeDefined()
    const text = section!.text()
    const cookie = 'Cookie (compies-appearance): merkt sich auf diesem Gerät deine Darstellung, damit auch die Seiten ohne Anmeldung, etwa die Anmeldeseite, so aussehen, wie du es gewählt hast. Es enthält nur deine Wahl („dark“ oder „system“), keine Kennung und keine Angaben zu dir. Compies setzt es nur, wenn deine Darstellung Dunkel oder System ist: sobald du sie in deinem Profil so wählst und, auf einem anderen Gerät, sobald du dich dort anmeldest. Wählst du Hell, wird es entfernt. Es läuft nach einem Jahr ab. Für diese Einstellung, die du selbst gewählt hast, ist es technisch notwendig; eine Einwilligung ist dafür nicht nötig, deshalb fragen wir sie nicht ab.'
    expect(text).toContain(cookie)
    expect(text.indexOf('Sitzungs-Cookies (Better Auth)')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('Sitzungs-Cookies (Better Auth)')).toBeLessThan(text.indexOf(cookie))
    expect(text.indexOf(cookie)).toBeLessThan(text.indexOf('Lokaler Speicher (compies-sound)'))
    expect(section!.findAll('p')).toHaveLength(10)
    // The one place the date is pinned: the day of the last change, 25 November 2026 (0.22, §§ 11 and 16 for the removal of a Member, #899; 0.21, §§ 6, 16 and 18 for the account deletion, #920; §§ 5, 6 and 7 for the own Profilbild, #912; before that 0.19, § 9 for the cookie of Reduced motion, #680, and for the Round card's memory, #838; before that 0.18, §4, §10, §11, §16 and §21 for the Chat and the Emotes, #775).
    expect(page.get('main').text()).toContain('Stand: 25. November 2026.')
  })

  it('name the compies-round-notes entry in section 9, right after compies.news.seen, word for word (#838, spec #856)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const section = page.findAll('section').find(s => s.get('h2').text() === '9. Cookies und Speicher im Browser')

    const paragraphs = section!.findAll('p').map(p => p.text())
    const entry = 'Lokaler Speicher (compies-round-notes): merkt sich auf diesem Gerät, ob du als Host die Notizen an einem Spiel auf- oder zugeklappt hast, damit sie beim nächsten Spiel wieder so erscheinen. Der Eintrag enthält nur diese Wahl, keine Kennung und keine Angaben zu dir, und bleibt, bis du die Browserdaten löschst.'
    const news = paragraphs.findIndex(p => p.startsWith('Lokaler Speicher (compies.news.seen)'))
    expect(news).toBeGreaterThan(0)
    expect(paragraphs[news + 1]).toBe(entry)
  })

  it('name the compies-motion cookie in section 9, right after compies-appearance, word for word (#680, spec #856)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const section = page.findAll('section').find(s => s.get('h2').text() === '9. Cookies und Speicher im Browser')

    const paragraphs = section!.findAll('p').map(p => p.text())
    const entry = 'Cookie (compies-motion): merkt sich auf diesem Gerät, dass du „Weniger Bewegung“ eingeschaltet hast, damit Compies die ruhigen Animationen schon beim Laden zeigt, auch auf Seiten ohne Anmeldung. Es enthält nur den Wert „reduced“, keine Kennung und keine Angaben zu dir. Compies setzt es, sobald du den Schalter in deinem Profil einschaltest, und entfernt es, wenn du ihn ausschaltest. Es läuft nach einem Jahr ab. Für diese Einstellung, die du selbst gewählt hast, ist es technisch notwendig; eine Einwilligung ist dafür nicht nötig.'
    const appearance = paragraphs.findIndex(p => p.startsWith('Cookie (compies-appearance)'))
    expect(appearance).toBeGreaterThan(0)
    expect(paragraphs[appearance + 1]).toBe(entry)
  })

  it('keep the Datenschutzerklärung\'s sections in order: the unnumbered intro, then 1 to 22 (#405)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const [intro, ...numbered] = page.findAll('section h2').map(h => h.text())

    expect(intro).toBe('Worum es geht')
    expect(numbered).toHaveLength(22)
    numbered.forEach((heading, index) => expect(heading.startsWith(`${index + 1}. `)).toBe(true))
  })

  it('name the live connection to Cloudflare Workers, since the browser connects there itself (#156)', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const live = page.findAll('section').find(s => s.get('h2').text().includes('Live-Verbindung'))

    expect(live?.text()).toContain('Cloudflare Workers')
    expect(live?.text()).toContain('IP-Adresse')
    expect(live?.text()).toContain('EU-Jurisdiktion')
  })

  it('ship no placeholder text', async () => {
    for (const [Page, route] of [[ImpressumPage, '/impressum'], [DatenschutzPage, '/datenschutz']] as const) {
      const page = await mountSuspended(Page, { route })

      expect(page.get('main').text()).not.toContain('PLATZHALTER')
    }
  })

  it('split a section text into paragraphs at blank lines', async () => {
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })
    const controller = page.findAll('section').find(s => s.get('h2').text() === '1. Verantwortlicher')!

    expect(controller.findAll('p')).toHaveLength(2)
    expect(controller.get('p').element.textContent).toContain('Gilges\nAugust-Thyssen-Str. 16\n52249 Eschweiler')
  })

  it('puts Profil above Abmelden, then Impressum, Datenschutz and the version in the avatar menu, not a version pill', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu)

    await menu.get('button[aria-haspopup="menu"]').trigger('click')

    const items = menu.findAll('[role="menuitem"]')
    expect(items.map(item => item.text())).toEqual(['Profil', 'Abmelden', 'Impressum', 'Datenschutz', expect.stringMatching(/^Version \d+\.\d+\.\d+/)])
    expect(items[0]!.attributes('href')).toBe('/profil')
    expect(items.slice(2).map(item => item.attributes('href'))).toEqual(['/impressum', '/datenschutz', '/neuigkeiten'])
    expect(menu.get('[role="none"]').text()).toContain('Kitty')
    expect(menu.findAll('*').filter(el => /^v\d+\.\d+\.\d+$/.test(el.text().trim()))).toHaveLength(0)
  })

  describe('the row „Darstellung“ in the avatar menu (#617)', () => {
    const TOAST = 'Das hat nicht geklappt, die Darstellung ist wieder wie vorher. Versuch’s nochmal.'
    const radios = (menu: VueWrapper) => menu.findAll('[role="menu"] [role="radio"]')
    const tickedRadio = (menu: VueWrapper) => radios(menu).filter(r => r.attributes('aria-checked') === 'true').map(r => r.text())

    beforeEach(() => {
      signInAs(kitty)
      useState('toasts').value = []
    })

    it('holds Hell, Dunkel and System with the current one ticked, in a wrapper hidden from md up', async () => {
      const menu = await mountSuspended(UserMenu)

      await menu.get('button[aria-haspopup="menu"]').trigger('click')

      const group = menu.findAll('[role="menu"] [role="radiogroup"][aria-label="Darstellung"]')
      expect(group).toHaveLength(1)
      expect(radios(menu).map(r => r.text())).toEqual(['Hell', 'Dunkel', 'System'])
      expect(tickedRadio(menu)).toEqual(['Hell'])
      expect(group[0]!.element.parentElement!.classList).toContain('md:hidden')
    })

    it('is absent when signed out', async () => {
      signInAs(null)

      const menu = await mountSuspended(UserMenu)

      expect(menu.find('[role="radiogroup"]').exists()).toBe(false)
      expect(menu.find('[role="menu"]').exists()).toBe(false)
    })

    it('applies a choice at once and keeps the menu open', async () => {
      const answered = vi.fn()
      registerEndpoint('/api/me/appearance', {
        method: 'POST',
        handler: async (event) => {
          const { appearance } = await readBody(event)
          answered(appearance)
          return { appearance }
        },
      })
      const menu = await mountSuspended(UserMenu, { attachTo: document.body })
      await menu.get('button[aria-haspopup="menu"]').trigger('click')

      await radios(menu)[1]!.trigger('click')

      expect(useAuthUser().value?.appearance).toBe('dark')
      expect(tickedRadio(menu)).toEqual(['Dunkel'])
      expect(menu.find('[role="menu"]').exists()).toBe(true)
      await vi.waitFor(() => expect(answered).toHaveBeenCalledWith('dark'))
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(shownToasts()).toEqual([])
      menu.unmount()
    })

    it('puts the tick back and shows the error toast when the save fails', async () => {
      registerEndpoint('/api/me/appearance', {
        method: 'POST',
        handler: () => {
          throw createError({ statusCode: 500 })
        },
      })
      const menu = await mountSuspended(UserMenu, { attachTo: document.body })
      await menu.get('button[aria-haspopup="menu"]').trigger('click')

      await radios(menu)[1]!.trigger('click')

      await vi.waitFor(() => expect(shownToasts()).toHaveLength(1))
      expect(shownToasts()[0]).toMatchObject({ tone: 'error', text: TOAST })
      expect(tickedRadio(menu)).toEqual(['Hell'])
      expect(menu.find('[role="menu"]').exists()).toBe(true)
      menu.unmount()
    })

    it('walks with ArrowDown from the row to Profil and back with ArrowUp, and ArrowDown there does not change the Appearance', async () => {
      const menu = await mountSuspended(UserMenu, { attachTo: document.body })
      await menu.get('button[aria-haspopup="menu"]').trigger('click')
      const profil = menu.findAll('[role="menuitem"]')[0]!
      expect(document.activeElement).toBe(profil.element)
      const selected = radios(menu)[0]!

      await profil.trigger('keydown', { key: 'ArrowUp' })
      expect(document.activeElement).toBe(selected.element)

      await selected.trigger('keydown', { key: 'ArrowDown' })
      expect(document.activeElement).toBe(profil.element)
      expect(useAuthUser().value?.appearance).toBe('light')
      menu.unmount()
    })
  })

  it('closes the menu on Esc and gives focus back to the avatar button', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu, { attachTo: document.body })
    const avatar = menu.get('button[aria-haspopup="menu"]')
    await avatar.trigger('click')

    await menu.get('[role="menu"]').trigger('keydown', { key: 'Escape' })

    expect(menu.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(avatar.element)
    menu.unmount()
  })

  it('moves focus from Profil to Abmelden, and from Abmelden on to Impressum, on ArrowDown', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu, { attachTo: document.body })
    await menu.get('button[aria-haspopup="menu"]').trigger('click')
    const profil = menu.findAll('[role="menuitem"]')[0]!
    expect(document.activeElement).toBe(profil.element)

    await profil.trigger('keydown', { key: 'ArrowDown' })
    const abmelden = menu.findAll('[role="menuitem"]').find(item => item.text() === 'Abmelden')!
    expect(document.activeElement).toBe(abmelden.element)

    await abmelden.trigger('keydown', { key: 'ArrowDown' })

    expect(document.activeElement).toBe(menu.findAll('[role="menuitem"]')[2]!.element)
    menu.unmount()
  })

  it('closes the menu on a click on Profil', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu, { attachTo: document.body })
    await menu.get('button[aria-haspopup="menu"]').trigger('click')

    await menu.findAll('[role="menuitem"]')[0]!.trigger('click')

    expect(menu.find('[role="menu"]').exists()).toBe(false)
    menu.unmount()
  })

  it('shows the reduced-motion hover on an overlay above the avatar, not on the covered button', async () => {
    signInAs(kitty)
    const menu = await mountSuspended(UserMenu)
    const button = menu.get('button[aria-haspopup="menu"]')

    // The avatar is opaque and covers the button, so the tint sits on a layer above it.
    expect(button.classes()).not.toContain('motion-reduce:hover:tint')
    const overlay = button.get('span.pointer-events-none')
    expect(overlay.classes()).toContain('motion-reduce:group-hover:tint')
    expect(overlay.classes()).toContain('reduced:group-hover:tint')
    expect(button.classes()).toContain('group')
  })

  it('goes back in history when the visitor came from inside the app', async () => {
    signInAs(null)
    const page = await mountSuspended(ImpressumPage, { route: '/impressum' })
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})

    setHistoryBack('/neu')
    await backLink(page).trigger('click')

    expect(go).toHaveBeenCalledWith(-1)
  })

  it('links to sign-in on a direct visit when signed out', async () => {
    signInAs(null)
    for (const [Page, route] of [[ImpressumPage, '/impressum'], [DatenschutzPage, '/datenschutz']] as const) {
      setHistoryBack(null)
      const page = await mountSuspended(Page, { route })

      expect(backLink(page).attributes('href')).toBe('/anmelden')
    }
  })

  it('links to Home on a direct visit when signed in', async () => {
    signInAs(kitty)
    setHistoryBack(null)
    const page = await mountSuspended(DatenschutzPage, { route: '/datenschutz' })

    expect(backLink(page).attributes('href')).toBe('/')
  })

  afterEach(() => {
    setHistoryBack(null)
    vi.restoreAllMocks()
  })
})
