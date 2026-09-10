"use client";

import styles from "./members.module.css";

// Approximate country centroids keep the map useful without exposing precise
// member coordinates. Location matching is intentionally country/region level.
const CENTROIDS = {
  Argentina: [-64, -38], Australia: [134, -25], Austria: [14, 47], Belgium: [4, 51],
  Brazil: [-52, -10], Canada: [-106, 57], China: [104, 35], Colombia: [-74, 4],
  Denmark: [10, 56], Egypt: [30, 27], Ethiopia: [40, 9], Finland: [26, 64],
  France: [2, 46], Germany: [10, 51], Ghana: [-2, 8], Greece: [22, 39],
  India: [79, 22], Indonesia: [117, -2], Ireland: [-8, 53], Israel: [35, 31],
  Italy: [12, 42], Japan: [138, 36], Kenya: [37, 0], Mexico: [-102, 23],
  Netherlands: [5, 52], NewZealand: [174, -41], Nigeria: [8, 9], Norway: [9, 62],
  Pakistan: [69, 30], Peru: [-76, -10], Philippines: [122, 12], Poland: [19, 52],
  Portugal: [-8, 39], Singapore: [104, 1], SouthAfrica: [24, -30], Spain: [-4, 40],
  Sweden: [16, 62], Switzerland: [8, 47], Tanzania: [35, -6], Thailand: [101, 15],
  Turkey: [35, 39], Uganda: [32, 1], Ukraine: [32, 49], UAE: [54, 24],
  UK: [-3, 55], UnitedKingdom: [-3, 55], UnitedStates: [-100, 38], Vietnam: [108, 16],
};

function keyForCountry(country = "") {
  return country.replace(/[^a-z]/gi, "");
}

function project([longitude, latitude]) {
  return [((longitude + 180) / 360) * 760 + 20, ((90 - latitude) / 180) * 300 + 20];
}

function fallbackPoint(country, index) {
  let hash = 0;
  for (const char of String(country || "unknown")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return [80 + (hash % 600), 70 + ((hash >>> 8) % 190) + (index % 3) * 5];
}

function pointFor(member, index) {
  const centroid = CENTROIDS[keyForCountry(member.country)] || CENTROIDS[member.country];
  return centroid ? project(centroid) : fallbackPoint(member.country, index);
}

export default function MembersMap({ members, selectedCountry, onSelectCountry }) {
  return (
    <section className={styles.mapCard} aria-labelledby="member-map-title">
      <div className={styles.mapHeader}>
        <div>
          <h2 id="member-map-title" className={styles.mapTitle}>Crafting around the world</h2>
          <p className={styles.mapSubtitle}>Approximate member locations by country and timezone.</p>
        </div>
        {selectedCountry && (
          <button type="button" className={styles.mapClear} onClick={() => onSelectCountry("")}>Clear map filter</button>
        )}
      </div>
      <div className={styles.mapViewport}>
        <svg viewBox="0 0 800 340" className={styles.mapSvg} role="img" aria-label="Approximate member locations">
          <rect x="0" y="0" width="800" height="340" rx="18" className={styles.mapOcean} />
          <path d="M75 88 140 55 213 72 244 112 204 139 165 130 128 151 93 129Z" className={styles.mapLand} />
          <path d="M230 171 279 188 300 229 282 287 245 260 232 219Z" className={styles.mapLand} />
          <path d="M363 83 405 70 437 88 430 122 401 134 378 119Z" className={styles.mapLand} />
          <path d="M376 144 435 137 467 169 454 241 420 274 388 237 371 191Z" className={styles.mapLand} />
          <path d="M450 76 528 56 625 77 696 120 674 155 604 146 552 166 496 140Z" className={styles.mapLand} />
          <path d="M635 225 686 235 710 264 681 283 641 267Z" className={styles.mapLand} />
          {members.map((member, index) => {
            const [cx, cy] = pointFor(member, index);
            const active = !selectedCountry || selectedCountry === member.country;
            return (
              <g
                key={member.id}
                className={active ? styles.mapMarker : `${styles.mapMarker} ${styles.mapMarkerMuted}`}
                role="button"
                tabIndex={0}
                aria-label={`${member.name}${member.country ? `, ${member.country}` : ""}`}
                onClick={() => onSelectCountry(member.country || "")}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectCountry(member.country || ""); }}
              >
                <circle cx={cx} cy={cy} r="7" />
                <title>{`${member.name}${member.location ? ` · ${member.location}` : ""}${member.timezone ? ` · ${member.timezone}` : ""}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <p className={styles.mapPrivacy}>Map markers are intentionally approximate. Members control the location shown on their profile.</p>
    </section>
  );
}
