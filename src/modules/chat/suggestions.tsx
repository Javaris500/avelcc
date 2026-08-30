/**
 * The four openings on an empty conversation. UI-PLAN section 8.
 *
 * They exist because "a blank command center is intimidating to an operator who
 * is not technical", and because a chat with no prompt is a blank command
 * center wearing a text box. The four are not examples of what a chat can do in
 * general. Each one is a question this product can answer about itself, and
 * three of the four map onto the read-only tools section 6 lists first.
 *
 * THEY FILL THE COMPOSER, THEY DO NOT SEND. That is deliberate beyond the
 * missing backend: an opening the operator can edit before sending is how they
 * learn what the agent takes, and a one-click send teaches nothing.
 */

export type Suggestion = {
	/** Stable, for the key and the testid. */
	key: string;
	/** Exactly what lands in the composer. */
	text: string;
};

export const SUGGESTIONS: Suggestion[] = [
	{ key: "new-request", text: "New request for a client" },
	{ key: "check-mission", text: "Check on a mission" },
	{ key: "blocking", text: "What is blocking me?" },
	{ key: "recent-work", text: "Show recent work" },
];

export function Suggestions({
	suggestions = SUGGESTIONS,
	onSelect,
}: {
	suggestions?: Suggestion[];
	onSelect: (text: string) => void;
}) {
	return (
		// A plain container. `role="group"` was here and is wrong: a group needs
		// a name to mean anything, and four buttons that each read as their own
		// full sentence do not gain one from being wrapped.
		<div className="flex flex-wrap gap-2" data-testid="chat-suggestions">
			{suggestions.map((suggestion) => (
				<button
					className="interactive rounded-full border border-[var(--elevation-border-rest)] bg-app-panel px-3 py-1.5 text-xs text-text-muted hover:border-[var(--elevation-border-raised)] hover:text-text max-md:min-h-11"
					data-testid={`chat-suggestion-${suggestion.key}`}
					key={suggestion.key}
					onClick={() => onSelect(suggestion.text)}
					type="button"
				>
					{suggestion.text}
				</button>
			))}
		</div>
	);
}
