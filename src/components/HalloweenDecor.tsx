import { useEffect, useState } from "react";

export default function HalloweenDecor() {
  const [bats, setBats] = useState<
    { id: number; top: number; delay: number; duration: number }[]
  >([]);

  useEffect(() => {
    setBats(
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        top: 8 + Math.random() * 55,
        delay: Math.random() * 8,
        duration: 12 + Math.random() * 10,
      }))
    );
  }, []);

  return (
    <>
      <div className="halloween-fog halloween-fog--one" />
      <div className="halloween-fog halloween-fog--two" />


      <div className="halloween-moon">
        <div className="halloween-moon__glow" />
      </div>

      <div className="halloween-bats">
        {bats.map((bat) => (
          <span
            key={bat.id}
            className="halloween-bat"
            style={{
              top: `${bat.top}%`,
              animationDelay: `${bat.delay}s`,
              animationDuration: `${bat.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="halloween-ground-glow" />
    </>
  );
}