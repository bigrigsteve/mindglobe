import { useEffect, useMemo, useRef, useState } from "react";
import type { Cluster, RemotePost } from "../types";
import { altitudeBand, coarseDensity, clusterPosts, decimalsForAltitude } from "../lib/clusterPosts";

type GlobeInstance = Record<string, any>;

export type GlobeViewProps = {
  posts: RemotePost[];
  onInspectCluster: (cluster: Cluster) => void;
  onAltitudeChange: (altitude: number) => void;
};

type PointDatum = {
  lat: number;
  lng: number;
  radius: number;
  color: string;
  altitude: number;
  label: string;
  cluster: Cluster;
};

function mixColor(hot: number) {
  const c1 = [92, 128, 255] as const;
  const c2 = [255, 105, 150] as const;
  const t = Math.min(1, Math.max(0, hot));
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgba(${r},${g},${b},0.92)`;
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

export default function GlobeView({ posts, onInspectCluster, onAltitudeChange }: GlobeViewProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const altitudeRef = useRef(2.65);
  const [zoomNonce, setZoomNonce] = useState(0);

  const grouped = useMemo(() => {
    const coarse = coarseDensity(posts);
    const dec = decimalsForAltitude(altitudeRef.current);
    return clusterPosts(posts, dec, coarse.map, coarse.max);
  }, [posts, zoomNonce]);

  useEffect(() => {
    let cancelled = false;

    /** lazy import keeps Vite startup snappy */
    void import("globe.gl").then((mod: unknown) => {
      const GlobeCall = /** @type {any} */ (mod)?.default;

      const el = holderRef.current;

      if (cancelled || !el || typeof GlobeCall !== "function") return;

      /** globe.gl default export callable -> returns another callable that attaches to the DOM host */
      const globe = GlobeCall()(el) as GlobeInstance;
      globeRef.current = globe;

      globe
        .globeImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg")
        .bumpImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png")
        .backgroundImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png")
        .pointsMerge(false)
        .pointLat("lat")
        .pointLng("lng")
        .pointAltitude("altitude")
        .pointRadius("radius")
        .pointColor("color")
        .pointLabel("label")
        .pointerEventsFilter(() => true)
        .labelsTransitionDuration(0)
        .htmlTransitionDuration(0)
        .onPointClick((d: unknown) => {
          const datum = d as Partial<PointDatum> | undefined;
          if (!datum?.cluster) return;
          onInspectCluster(datum.cluster);
        })
        .onZoom((pov: { altitude?: number }) => {
          if (typeof pov.altitude !== "number") return;
          altitudeRef.current = pov.altitude;

          queueMicrotask(() => {
            onAltitudeChange(pov.altitude!);
          });

          setZoomNonce((v) => (v > 980 ? 1 : v + 1));
        });

      const controls = globe.controls?.();

      /** gentle ambient motion feels “alive” until the viewer grabs it */
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.28;

        controls.addEventListener?.("start", () => {
          controls.autoRotate = false;
        });
      }

      globe.pointOfView({ lat: 12, lng: 18, altitude: 2.75 }, 0);
    });

    return () => {
      cancelled = true;
      globeRef.current?.pauseAnimation?.();
      globeRef.current = null;
      if (holderRef.current) holderRef.current.innerHTML = "";
    };
  }, [onAltitudeChange, onInspectCluster]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;

    const altitude = altitudeRef.current;
    const band = altitudeBand(altitude);

    const pts: PointDatum[] = grouped.map((c) => {
      /** angular degrees-ish radii tuned for readability without overwhelming clusters */
      const sizeBoost = Math.sqrt(Math.max(1, c.count)) * 0.06;
      const hotBoost = clamp(c.intensity, 0, 1) * 0.19;

      const radius =
        band === "orbit"
          ? clamp(0.1 + hotBoost + sizeBoost * 0.35, 0.075, 0.65)
          : band === "regional"
            ? clamp(0.085 + sizeBoost * 0.32 + hotBoost * 0.15, 0.06, 0.35)
            : clamp(0.055 + sizeBoost * 0.22, 0.035, 0.16);

      const color = mixColor(c.intensity + (c.count > 3 ? 0.07 : 0));

      /** lift markers slightly above the surface */
      const lift = band === "street" ? 0.022 : band === "regional" ? 0.038 : 0.06;

      const label =
        band === "orbit"
          ? ""
          : band === "regional"
            ? c.count > 1
              ? `${c.count} voices`
              : c.preview ?? ""
            : (c.preview ?? "").slice(0, 520);

      return {
        lat: c.lat,
        lng: c.lng,
        radius,
        color,
        altitude: lift,
        label,
        cluster: c,
      };
    });

    g.pointsData(pts);

    const labelRows =
      band === "orbit"
        ? []
        : grouped.map((c) => ({
            lat: c.lat,
            lng: c.lng,
            text:
              band === "regional"
                ? c.count > 1
                  ? `${c.count} voices nearby`
                  : (c.preview ?? "Thought").trim()
                : (c.preview ?? "").slice(0, 820),
          }));

    /** guard label glitches during tiny counts */
    const cleanedLabels = labelRows
      .map((row) => ({ ...row, text: typeof row.text === "string" ? row.text.trim() : "" }))
      .filter((row) => row.text.length > 0);

    g.labelsData(cleanedLabels);
    if (typeof g.labelText === "function") {
      void g.labelText("text");
    }
    void g.labelLat("lat");
    void g.labelLng("lng");

    /** lower altitude ⇒ larger typography so previews feel legible nearby */
    const labelSize =
      band === "street" ? 0.62 : altitude > 2.2 ? 0.22 : 0.42;

    if (typeof g.labelSize === "function") {
      void g.labelSize(labelSize);
    }

    void g.labelColor(() => "rgba(245,245,253,0.78)");
    void g.labelAltitude(0.01);
    void g.labelDotRadius(0.04);
    void g.labelDotOrientation("bottom");

    const ringRows =
      band === "orbit"
        ? grouped
            .filter((c) => c.count >= 4 || c.intensity > 0.48)
            .map((c) => ({
              lat: c.lat,
              lng: c.lng,
            }))
        : grouped
            .filter((c) => c.count >= 8 || c.intensity > 0.76)
            .map((c) => ({
              lat: c.lat,
              lng: c.lng,
            }));

    g.ringsData(ringRows);

    /** subtle “heat” halo */
    if (typeof g.ringColor === "function") void g.ringColor(() => ["rgba(255,120,166,0.35)", "rgba(120,154,255,0.06)"]);

    void g.ringMaxRadius(Math.max(0.9, 2.05 - altitude * 0.12));
    void g.ringAltitude(0.0025);

    /** snap rings so busy areas visibly “throb”, calmer neighborhoods stay quiet */
    if (typeof g.ringPropagationSpeed === "function") {
      void g.ringPropagationSpeed(1.85);
      void g.ringRepeatPeriod(820);
      void g.ringResolution(48);
    }
  }, [grouped]);

  /** initial altitude broadcast */
  useEffect(() => {
    queueMicrotask(() => onAltitudeChange(altitudeRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount after first paint is enough as onZoom catches later
  }, [onAltitudeChange]);

  return <div className="globe-host" ref={holderRef} />;
}
