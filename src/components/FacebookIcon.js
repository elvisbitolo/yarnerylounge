// Mirrors GoogleIcon so the two provider buttons sit at the same optical weight.
// Official Meta brand mark — do not recolour it; the white-on-blue monogram is
// required to stay recognisable next to the multicolour Google mark.
export default function FacebookIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.446 18.627.073 12 .073S0 5.446 0 12.073c0 5.989 4.388 10.951 10.125 11.85v-8.385H7.078v-3.47h3.047V9.431c0-3.007 1.792-4.669 4.533-4.669 1.313 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.926-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.024 24 18.062 24 12.073z"
      />
    </svg>
  );
}