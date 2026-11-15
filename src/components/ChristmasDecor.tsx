import { useMemo } from "react";

const SNOWFLAKES = [
  { left: "2%", delay: "0s", duration: "10s", size: "14px" },
  { left: "7%", delay: "2s", duration: "13s", size: "18px" },
  { left: "13%", delay: "5s", duration: "11s", size: "12px" },
  { left: "19%", delay: "1s", duration: "15s", size: "20px" },
  { left: "26%", delay: "7s", duration: "12s", size: "15px" },
  { left: "33%", delay: "3s", duration: "14s", size: "17px" },
  { left: "40%", delay: "9s", duration: "10s", size: "13px" },
  { left: "47%", delay: "4s", duration: "16s", size: "19px" },
  { left: "54%", delay: "6s", duration: "12s", size: "14px" },
  { left: "61%", delay: "0s", duration: "14s", size: "18px" },
  { left: "68%", delay: "8s", duration: "11s", size: "13px" },
  { left: "75%", delay: "2s", duration: "15s", size: "20px" },
  { left: "82%", delay: "5s", duration: "13s", size: "15px" },
  { left: "89%", delay: "1s", duration: "12s", size: "17px" },
  { left: "96%", delay: "7s", duration: "16s", size: "14px" },
];

export default function ChristmasDecor() {
  const snowflakes = useMemo(() => SNOWFLAKES, []);

  return (
    <div className="christmas-decor" aria-hidden="true">
      <div className="christmas-lights">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      

      <div className="snowfall">
        {snowflakes.map((snow, i) => (
          <span
            key={i}
            className="snowflake"
            style={{
              left: snow.left,
              animationDelay: snow.delay,
              animationDuration: snow.duration,
              fontSize: snow.size,
            }}
          >
            ❄
          </span>
        ))}
      </div>

      
    </div>
  );
}