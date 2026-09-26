/**
 * The coaching resource library.
 *
 * Deliberately not in the database. Every organization sees the same list, it
 * is read-only from the interface, and it changes when somebody edits this
 * file -- so a table, its policies and a loading state would all be machinery
 * around a constant. Moving it into Postgres later is a small job and the
 * shape below is already the shape those rows would take; see the note at the
 * bottom of this file.
 *
 * Not scoped to a program on purpose. Concussion training applies to whoever
 * is on the field, and a coach running soccer in the autumn is often the same
 * person running basketball in the winter, so the whole library is visible
 * from inside any program.
 *
 * Every link here was fetched and confirmed to resolve on 2026-09-25. Three
 * were corrected from their originally supplied form -- each is marked.
 */

export type Resource = {
  title: string
  /** One line. What it is and what it costs you to use it. */
  description: string
  /** Where it lives. Opened in a new tab, never framed. */
  url: string
  /**
   * A single YouTube video id, when the resource IS one video worth watching
   * in place. A channel or a website leaves this off and simply links out.
   */
  youtubeId?: string
  /** Shown as a small tag: "Free", "Free course", "Video". */
  tag?: string
}

export type ResourceCategory = {
  /** Stable key, used for the anchor and as a React key. */
  key: string
  title: string
  /** Sits under the heading, sets up what the group is for. */
  blurb: string
  items: Resource[]
}

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  {
    key: 'safety',
    title: 'Safety & Certification',
    blurb: 'Start here. These apply to every sport and most leagues expect them.',
    items: [
      {
        title: 'CDC HEADS UP Concussion Training',
        description:
          'The standard concussion course for youth coaches: spotting it, and what to do on the spot. Free, about 30 minutes, certificate at the end.',
        // Corrected. The originally supplied cdc.gov/headsup/youthsports/index.html
        // is now a hard 404 -- the CDC restructured HEADS UP onto /heads-up/.
        url: 'https://www.cdc.gov/heads-up/training/youth-sports.html',
        tag: 'Free course',
      },
      {
        title: 'How to Coach Kids',
        description:
          'Nike, Project Play and NRPA on coaching children rather than coaching a sport. Free, about 30 minutes, no sport-specific knowledge assumed.',
        url: 'https://www.nrpa.org/our-work/Promotional-Partnerships/how-to-coach-kids/',
        tag: 'Free course',
      },
      {
        title: 'Youth Sports Coach-Mentor Certification',
        description:
          'Free mentor training from the U.S. Soccer Foundation via NCYS. Written for all youth sports, not only soccer.',
        url: 'https://ncys.org/education/free-youth-sports-mentor-certification/',
        tag: 'Free',
      },
    ],
  },
  {
    key: 'philosophy',
    title: 'Coaching Philosophy',
    blurb: 'How to run a season kids want to come back to.',
    items: [
      {
        title: 'Positive Coaching Alliance',
        description:
          'Articles, videos and workshops on culture, parents and keeping sport worth playing. Much of the library is free to read.',
        url: 'https://positivecoach.org/',
      },
      {
        title: 'National Alliance for Youth Sports',
        description:
          'NAYS coach training and certification, plus chapters for parents and officials. Some courses are paid.',
        url: 'https://www.nays.org/',
      },
    ],
  },
  {
    key: 'soccer',
    title: 'Soccer',
    blurb: 'Session plans and drills you can run at practice tomorrow.',
    items: [
      {
        title: 'OnlineSoccerTraining',
        description:
          'Straightforward drills aimed at younger and beginner teams. Start with the dribbling series below, then work through the channel.',
        url: 'https://www.youtube.com/@onlinesoccertraining',
        youtubeId: 'dDXjFKn-eO8',
        tag: 'Video',
      },
      {
        title: 'SoccerCoachTV',
        description:
          'A large general drill library that scales up as your players do. The decision-making drill below works at any age.',
        url: 'https://www.youtube.com/@SoccerCoachTV',
        youtubeId: 'JXDkJIGC9Ok',
        tag: 'Video',
      },
    ],
  },
  {
    key: 'flag-football',
    title: 'Flag Football',
    blurb: 'Practice plans, drills and the rules side of running a flag season.',
    items: [
      {
        title: 'USA Football Coach Tools',
        description:
          'Practice plans, drills and certification from the sport’s governing body. The flag coaching course is the one most leagues ask for.',
        // Corrected. usafootball.com resolves, but the coach-facing hub the
        // list was describing is one level in.
        url: 'https://usafootball.com/coaches-organizations/coach-tools',
      },
      {
        title: 'NFL FLAG Coaches’ Guide',
        description:
          'The NFL’s own guide to running a flag team: practice structure, drills and rules. This is where the coaching content actually lives.',
        url: 'https://playfootball.nfl.com/flag/coaches-guide/',
        tag: 'Free',
      },
      {
        title: 'NFL Play Football (YouTube)',
        description:
          'The official NFL youth channel. Worth following for the programme, though the feed is league news and highlights rather than drills.',
        url: 'https://www.youtube.com/@playfootball',
      },
      {
        title: '10 Most Popular Flag Football Drills',
        description:
          'MOJO’s ten drills, each written up with a diagram and a point. A good practice plan in one page.',
        url: 'https://mojo.sport/coachs-corner/10-most-popular-flag-football-drills-on-mojo/',
      },
    ],
  },
  {
    key: 'basketball',
    title: 'Basketball',
    blurb: 'Curriculum for a whole season, and drills for a single practice.',
    items: [
      {
        title: 'Jr. NBA Instructional Curriculum',
        description:
          'Forty-eight ready-made practice plans by age group, free from the NBA. The closest thing to a season in a box.',
        url: 'https://jr.nba.com/jr-nba-instructional-curriculum',
        tag: 'Free',
      },
      {
        title: 'Breakthrough Basketball Drill Library',
        description:
          'Over two hundred drills, filterable by skill and age. Free to browse; the deeper programmes are paid.',
        // Corrected. The bare domain lands on marketing; this is the library
        // the list was pointing at.
        url: 'https://www.breakthroughbasketball.com/drills/basketballdrills',
      },
    ],
  },
]

/** Every resource, flattened. Used for the count on the home tile. */
export const RESOURCE_COUNT = RESOURCE_CATEGORIES.reduce(
  (total, category) => total + category.items.length,
  0,
)

/*
 * Making this editable later
 * --------------------------
 * Two tables mirroring the two types above -- resource_categories (key, title,
 * blurb, position) and resources (category_id, title, description, url,
 * youtube_id, tag, position) -- each with an organization_id that is NULL for
 * the curated rows below and set for an organization's own additions. Read
 * policy: any member of the organization may select rows where organization_id
 * is null or matches theirs. Write policy: the org-leader check that already
 * guards the overview. The page would then load rows instead of importing this
 * constant, and nothing else about it changes.
 */
