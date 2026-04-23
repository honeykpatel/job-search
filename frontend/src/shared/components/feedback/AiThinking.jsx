import { motion } from "../../lib/motion";

export function AiThinking({ label = "AI is thinking" }) {
  return (
    <div className="ai-thinking" role="status" aria-live="polite">
      <div className="ai-thinking__dots" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.15, repeat: Infinity, delay: index * 0.12, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span>{label}</span>
    </div>
  );
}
