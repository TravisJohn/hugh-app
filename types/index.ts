// ── Interview state machine ───────────────────────────────────────────────
// Use these constants everywhere — never compare to raw strings.
export const InterviewState = {
  IDLE:             'IDLE',
  PLAYING_QUESTION: 'PLAYING_QUESTION',
  READY:            'READY',
  RECORDING:        'RECORDING',
  REVIEWING:        'REVIEWING',
  SUBMITTING:       'SUBMITTING',
  FEEDBACK:         'FEEDBACK',
  BREAK:            'BREAK',
} as const;

export type InterviewState = typeof InterviewState[keyof typeof InterviewState];

// ── Domain types ──────────────────────────────────────────────────────────
export type PresetRoom = 'data_engineering' | 'data_science' | 'ml_engineering';
export type Room       = PresetRoom | 'custom';

export type CoachingMode = 'active' | 'passive';

export const VALID_ROOMS: Room[] = [
  'data_engineering',
  'data_science',
  'ml_engineering',
  'custom',
];

export function isValidRoom(value: string): value is Room {
  return VALID_ROOMS.includes(value as Room);
}

export function isPresetRoom(r: Room): r is PresetRoom {
  return r !== 'custom';
}

// ── Entity interfaces (mirror DB schema exactly) ──────────────────────────
export interface Persona {
  id:      string;
  name:    string;
  role:    string;
  company: string;
  voiceId: string;
  avatar:  string;
}

export interface Session {
  id:              string;
  user_id:         string;
  room:            Room;
  persona_id:      string;
  status:          'active' | 'paused' | 'completed';
  coaching_mode:   CoachingMode;
  question_count:  number;
  topic:           string | null;
  job_description: string | null;
  skip_intro:      boolean;
  voice_enabled:   boolean;
  started_at:      string;
  ended_at:        string | null;
}

export interface Question {
  id:            string;
  session_id:    string;
  question_text: string;
  best_answer:   string;
  question_type: 'intro' | 'domain';
  order_index:   number;
  asked_at:      string;
}

export interface Answer {
  id:                 string;
  question_id:        string;
  transcript:         string;
  viewed_best_answer: boolean;
  used_best_answer:   boolean;
  feedback_text:      string | null;
  submitted_at:       string;
}

// Persona without voiceId — safe to pass to Client Components.
// The actual ElevenLabs voice ID stays server-only; the TTS route
// resolves it from personaId server-side.
export type ClientPersona = Omit<Persona, 'voiceId'>;

// ── Learning goals (dashboard) ────────────────────────────────────────────
// Status of the Kanban track that is generated for a goal in the background.
export type TrackStatus = 'pending' | 'ready' | 'failed';

export interface LearningGoal {
  id:           string;
  user_id:      string;
  topic:        string;
  start_date:   string;
  end_date:     string;
  track_status: TrackStatus;
  created_at:   string;
}

// ── Progress Tracker ──────────────────────────────────────────────────────
export type KanbanColumn = 'backlog' | 'learn' | 'review' | 'done';

export const KANBAN_COLUMNS: KanbanColumn[] = ['backlog', 'learn', 'review', 'done'];

export const KANBAN_COLUMN_LABELS: Record<KanbanColumn, string> = {
  backlog: 'Backlog',
  learn:   'Learning',
  review:  'Review',
  done:    'Mastered',
};

export type BacklogPriorityMode = 'auto' | 'manual';

export interface Track {
  id:                    string;
  user_id:               string;
  goal_id:               string | null;
  title:                 string;
  topic_description:     string;
  status:                'active' | 'paused' | 'completed';
  focus_milestone_id:    string | null;
  backlog_priority_mode: BacklogPriorityMode;
  created_at:            string;
}

// A single "thing to understand" derived from a milestone's goal.
export interface LearningPoint {
  id:   string;
  text: string;
}

// Self-assessment status for a single learning point. Absent from the map =
// unstarted. Purely the learner's own awareness flag — never gates mastery.
export type PointStatus = 'understood' | 'bookmarked' | 'stuck';

// Per-milestone self-assessment: each learning point id mapped to its status.
export interface MilestoneCoverage {
  statuses:  Record<string, PointStatus>;
  updatedAt: string;
}

export interface Milestone {
  id:                string;
  track_id:          string;
  title:             string;
  summary:           string;
  kanban_column:     KanbanColumn;
  position:          number;
  review_validated:  boolean;
  mastery_validated: boolean;
  mastery_score:     number | null;
  learning_points:   LearningPoint[] | null;
  coverage:          MilestoneCoverage | null;
  priority_rank:     number | null;
  priority_reason:   string | null;
  mastery_feedback:  string | null;
  summary_doc:       string | null;
  summary_doc_at:    string | null;
  created_at:        string;
}

export type FactStatus = 'pending' | 'correct' | 'incorrect';

export interface MilestoneEntry {
  id:           string;
  milestone_id: string;
  user_id:      string;
  title:        string | null;
  body:         string;
  fact_status:  FactStatus;
  correction:   string | null;
  gap_note:     string | null;
  corrected:    boolean;
  // Optional tag to one of the milestone's learning points (a LearningPoint.id
  // from learning_points JSONB). null = untagged / general entry.
  point_id:     string | null;
  created_at:   string;
}

// Track with milestone counts precomputed — used on the dashboard.
export interface TrackWithStats extends Track {
  milestones: Pick<Milestone, 'id' | 'kanban_column'>[];
}
