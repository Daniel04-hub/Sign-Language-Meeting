/**
 * components/SignBadge.jsx
 *
 * Displays a detected sign language gesture label as a small floating
 * badge.  Auto-disappears after 2 seconds via a fade-out animation
 * defined in index.css (.sign-badge uses the `fadeInOut` keyframe).
 *
 * Props:
 *   sign {string}  — the recognised sign name, e.g. "Hello" or "Thank you"
 */

import { useState, useEffect } from 'react';

function SignBadge({ sign }) {
  const [visible, setVisible] = useState(false);
  const [currentSign, setCurrentSign] = useState(sign);

  useEffect(() => {
    if (!sign) return;

    // Show the badge with the new sign text.
    setCurrentSign(sign);
    setVisible(true);

    // Hide after 2 s.
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [sign]);

  if (!visible || !currentSign) return null;

  return (
    <div className="sign-badge">
      🤟 {currentSign}
    </div>
  );
}

export default SignBadge;
