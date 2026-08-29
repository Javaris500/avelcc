import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode, RefObject } from "react";

/**
 * The sidebar, off-canvas, below the compact breakpoint.
 *
 * Radix Dialog rather than a hand-rolled panel: it supplies the focus trap,
 * Escape, the inert background and focus restoration to whatever was focused
 * before it opened. A hand-rolled drawer is how one ships something unusable
 * by keyboard, and the tests would then be verifying our own mistake.
 *
 * NOTE: this imports Radix directly rather than `#/ui/dialog`,
 * which does not exist yet. When that primitive lands this should switch to it
 * and lose the direct dependency. Filed, not worked around silently.
 */
export function NavDrawer({
	open,
	onOpenChange,
	returnFocusTo,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/**
	 * Where focus goes on close. Radix restores to whatever it captured when
	 * the dialog opened, but the trigger lives outside this Root, so it is
	 * named explicitly rather than left to chance.
	 */
	returnFocusTo: RefObject<HTMLButtonElement | null>;
	children: ReactNode;
}) {
	return (
		<Dialog.Root onOpenChange={onOpenChange} open={open}>
			<Dialog.Portal>
				<Dialog.Overlay
					className="fixed inset-0 z-40 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
					data-testid="nav-drawer-overlay"
				/>
				<Dialog.Content
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						returnFocusTo.current?.focus();
					}}
					className="fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-[var(--elevation-border-rest)] bg-app-panel shadow-e2 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
					data-testid="nav-drawer"
				>
					{/* Radix requires a title for the accessible name. It is the
					    drawer's only label, so it is real text rather than empty. */}
					<Dialog.Title className="sr-only">Navigation</Dialog.Title>
					<Dialog.Description className="sr-only">
						Workspace, search, navigation and account.
					</Dialog.Description>

					<Dialog.Close
						aria-label="Close navigation"
						className="interactive absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-sm text-text-subtle"
						data-testid="nav-drawer-close"
					>
						<X aria-hidden="true" size={16} strokeWidth={1.8} />
					</Dialog.Close>

					{children}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
