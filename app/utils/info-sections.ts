// What InfoSheet shows for each topic (#172, D6): the sections in order, each with the paragraphs under its heading.
// Copy: heading `setup.info.sections.<section>`, paragraph `setup.info.<topic>.<part>`. The table, not the existence of a
// translation, decides what shows; test/unit/info-sections.test.ts checks that every listed key is in de.json.

export const INFO_TOPICS = ['teams', 'ffa', 'admin', 'wheel'] as const
export type InfoTopic = (typeof INFO_TOPICS)[number]

export type InfoSection = 'how' | 'hideWheel' | 'good' | 'warn'

export interface InfoSectionParts {
  section: InfoSection
  parts: string[]
}

const BASICS: InfoSectionParts[] = [
  { section: 'how', parts: ['how'] },
  { section: 'good', parts: ['good'] },
  { section: 'warn', parts: ['warn'] },
]

export const INFO_SECTIONS: Record<InfoTopic, InfoSectionParts[]> = {
  teams: BASICS,
  ffa: BASICS,
  admin: BASICS,
  // The hidden wheel option ends with what the Host sees (#145).
  wheel: [
    { section: 'how', parts: ['how'] },
    { section: 'hideWheel', parts: ['hideWheel', 'hostSees'] },
    { section: 'good', parts: ['good'] },
    { section: 'warn', parts: ['warn'] },
  ],
}
