// Typed errors from the data layer. Callers (Server Actions, route handlers)
// turn these into plain messages; nothing here is shown to users raw.

export class DataError extends Error {}

export class NotFound extends DataError {
  constructor(public readonly what: string) {
    super(`${what} not found`);
  }
}

export class NoCurrentTerm extends DataError {
  constructor() {
    super("No current term is set for this school");
  }
}

export class NotSignedIn extends DataError {
  constructor() {
    super("A signed-in user is required to save");
  }
}

export class InvalidScore extends DataError {
  constructor(
    public readonly studentId: string,
    public readonly componentKey: string,
    public readonly value: string,
    reason: string,
  ) {
    super(`Score "${value}" for ${componentKey} is not valid: ${reason}`);
  }
}

export class ScoreAboveMaximum extends DataError {
  constructor(
    public readonly studentId: string,
    public readonly componentLabel: string,
    public readonly max: string,
    public readonly value: string,
  ) {
    super(`${componentLabel} is out of ${max}. You wrote ${value}.`);
  }
}

export class NotTakingSubject extends DataError {
  constructor(public readonly studentIds: string[]) {
    super(`${studentIds.length} student(s) are not taking this subject this term`);
  }
}

export class Conflict extends DataError {
  constructor(public readonly studentIds: string[]) {
    super(`Scores for ${studentIds.length} student(s) were changed by someone else since you opened the sheet`);
  }
}

export class TermClosed extends DataError {
  constructor() {
    super("Scores can only be changed in the current term");
  }
}

export class NotInClass extends DataError {
  constructor(public readonly studentIds: string[]) {
    super(`${studentIds.length} student(s) are no longer in this class this term`);
  }
}

export class InvalidRemark extends DataError {
  constructor(
    public readonly studentId: string,
    public readonly field: string,
    reason: string,
  ) {
    super(`The ${field} comment for ${studentId} is not valid: ${reason}`);
  }
}

/** A released term's figures, comments and class lists are locked (spec 0014, AC-4). */
export class TermReleased extends DataError {
  constructor(public readonly termLabel: string) {
    super(`${termLabel} results are released to parents. Ask the VoxLMS team to withdraw the release before changing them.`);
  }
}

/** RESULT_PIN_SECRET is missing or too short (spec 0014, AC-20). Never falls back to a default key. */
export class PinKeyMissing extends DataError {
  constructor() {
    super("PIN slips can't be made: the server's PIN key is missing. Tell the developer.");
  }
}

/** Every student asked for already has a live slip (spec 0014, AC-5). */
export class NothingToPrint extends DataError {
  constructor(message = "Every student has a slip.") {
    super(message);
  }
}

/** The slip changed after the page loaded (spec 0014, AC-11). */
export class SlipAlreadyReplaced extends DataError {
  constructor() {
    super("This slip was already replaced. The list has been refreshed.");
  }
}
