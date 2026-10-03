// @vitest-environment jsdom
/**
 * Unit tests — RouterConsentDialog (§EE 17.2) + the footer's consent
 * chip + the draw panel's consent/snap surfaces.
 *
 * The contract: the plain notice ("snapping sends the drawn line to a
 * third-party router"), grant/decline/revoke intents, the manage mode
 * while granted, the custom-router copy, and the draw tools' enable
 * notice — pure presentation, intents out.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouterConsentDialog } from "@/components/shared/router-consent-dialog";

afterEach(cleanup);

function renderDialog(props: Partial<Parameters<typeof RouterConsentDialog>[0]> = {}) {
  const onGrant = vi.fn();
  const onDecline = vi.fn();
  const onRevoke = vi.fn();
  const onClose = vi.fn();
  const onOpenPrivacy = vi.fn();
  render(
    <RouterConsentDialog
      open
      consent="unknown"
      hostsLabel="router.project-osrm.org · valhalla1.openstreetmap.de"
      customRouter={false}
      onGrant={onGrant}
      onDecline={onDecline}
      onRevoke={onRevoke}
      onClose={onClose}
      onOpenPrivacy={onOpenPrivacy}
      {...props}
    />,
  );
  return { onGrant, onDecline, onRevoke, onClose, onOpenPrivacy };
}

describe("RouterConsentDialog (grant mode)", () => {
  it("states the plain notice with the hosts it would contact", () => {
    renderDialog();
    expect(
      screen.getByTestId("router-consent-notice"),
    ).toHaveTextContent(/sends the drawn line to a third-party router/i);
    expect(screen.getByTestId("router-consent-notice")).toHaveTextContent(
      "router.project-osrm.org · valhalla1.openstreetmap.de",
    );
    expect(screen.getByText(/never your GPX file/i)).toBeInTheDocument();
  });

  it("grant and decline dispatch their intents", () => {
    const intents = renderDialog();
    fireEvent.click(screen.getByTestId("router-consent-grant"));
    expect(intents.onGrant).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("router-consent-decline"));
    expect(intents.onDecline).toHaveBeenCalledTimes(1);
  });

  it("names the session scope and the privacy door", () => {
    renderDialog();
    expect(screen.getByText(/this session only/i)).toBeInTheDocument();
    expect(screen.getByText(/fresh page load asks again/i)).toBeInTheDocument();
  });

  it("the privacy link dispatches its intent", () => {
    const intents = renderDialog();
    fireEvent.click(screen.getByTestId("router-consent-privacy-link"));
    expect(intents.onOpenPrivacy).toHaveBeenCalledTimes(1);
  });

  it("the custom-router copy appears when a server is configured", () => {
    renderDialog({
      customRouter: true,
      hostsLabel: "osrm.example.com",
      consent: "unknown",
    });
    expect(screen.getByText(/configured your own routing server/i)).toBeInTheDocument();
    expect(screen.getAllByText(/osrm\.example\.com/).length).toBeGreaterThan(0);
  });
});

describe("RouterConsentDialog (manage mode)", () => {
  it("shows the on state and offers the turn-off", () => {
    const intents = renderDialog({ consent: "granted" });
    expect(screen.getByTestId("router-consent-manage-note")).toHaveTextContent(
      /enabled for this session/i,
    );
    expect(screen.getByTestId("router-consent-revoke")).toHaveTextContent(
      /turn off for this session/i,
    );
    fireEvent.click(screen.getByTestId("router-consent-revoke"));
    expect(intents.onRevoke).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("router-consent-done"));
    expect(intents.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("RouterConsentDialog (closed)", () => {
  it("renders nothing when closed", () => {
    const intents = renderDialog({ open: false });
    expect(screen.queryByTestId("router-consent-dialog")).toBeNull();
    expect(intents.onGrant).not.toHaveBeenCalled();
  });
});
