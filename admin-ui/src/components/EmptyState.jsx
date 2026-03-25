import React from 'react';

/**
 * EmptyState — reusable empty / zero-data component
 * Props: icon (lucide component), title, description, action (React node)
 */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state" role="status" aria-label={title}>
      {Icon && (
        <div className="empty-state-icon" aria-hidden="true">
          <Icon size={36} strokeWidth={1.4} />
        </div>
      )}
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
