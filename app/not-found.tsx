import ErrorScreen from "@/components/ui/ErrorScreen";

/**
 * A page that does not exist — including a track, milestone or case whose id is
 * gone or was never the learner's.
 *
 * Deliberately not an error: nothing broke, so there is nothing to retry and
 * `ErrorScreen` offers no action button here. Rule 5 cuts both ways — telling
 * someone to "try again" on a page that will never exist is the same lie as
 * showing a spinner for a failure.
 */
export default function NotFound() {
  return (
    <ErrorScreen
      title="Nothing here"
      message="This page does not exist, or it is not yours to open. If you followed a link from inside Hugh, the thing it pointed at may since have been deleted."
      homeHref="/home"
      homeLabel="Back to your activities"
    />
  );
}
