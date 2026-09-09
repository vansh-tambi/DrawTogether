import type { UserPresence } from '../shared/protocol';

export interface PresenceUser {
  userId: string;
  color: string;
}

export class PresenceUI {
  private container: HTMLElement;
  private users: Map<string, PresenceUser> = new Map();
  private localUserId: string;
  public onCountChange?: (count: number) => void;

  constructor(container: HTMLElement, localUserId: string) {
    this.container = container;
    this.localUserId = localUserId;
    this.render();
  }

  public setLocalUserId(userId: string): void {
    this.localUserId = userId;
    this.render();
  }

  public setUsers(presenceList: UserPresence[]): void {
    this.users.clear();
    for (const p of presenceList) {
      this.users.set(p.userId, {
        userId: p.userId,
        color: p.color,
      });
    }
    this.render();
  }

  public addUser(userId: string, color: string): void {
    this.users.set(userId, { userId, color });
    this.render();
  }

  public removeUser(userId: string): void {
    const el = Array.from(this.container.querySelectorAll<HTMLElement>('[data-user-id]')).find(
      (candidate) => candidate.dataset.userId === userId
    );
    if (el) {
      el.classList.add('scale-75', 'opacity-0', 'transition-all', 'duration-200');
      setTimeout(() => {
        this.users.delete(userId);
        this.render();
      }, 180);
    } else {
      this.users.delete(userId);
      this.render();
    }
  }

  public getUserColor(userId: string): string | undefined {
    return this.users.get(userId)?.color;
  }

  public getUserCount(): number {
    return this.users.size;
  }

  private getInitials(userId: string): string {
    const clean = userId.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length >= 2) {
      return clean.substring(clean.length - 2).toUpperCase();
    }
    return (clean[0] || 'U').toUpperCase();
  }

  private formatShortId(userId: string): string {
    if (userId.length <= 10) return userId;
    return `${userId.substring(0, 8)}…`;
  }

  /**
   * Renders a vertical stacked list of users showing avatar + truncated username.
   * Local user gets a "(You)" tag. Overflow users shown as "+N More" pill.
   */
  public render(): void {
    const count = this.users.size;
    if (this.onCountChange) {
      this.onCountChange(count);
    }

    const allUsers = Array.from(this.users.values());
    // Put local user first
    allUsers.sort((a, b) => {
      if (a.userId === this.localUserId) return -1;
      if (b.userId === this.localUserId) return 1;
      return 0;
    });

    const maxVisible = 3;
    const visibleUsers = allUsers.slice(0, maxVisible);
    const overflowCount = allUsers.length - maxVisible;

    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col items-end space-y-1';

    for (const user of visibleUsers) {
      const isLocal = user.userId === this.localUserId;
      const initials = this.getInitials(user.userId);
      const displayName = this.formatShortId(user.userId);

      const item = document.createElement('div');
      item.className = 'presence-user-item';
      item.dataset.userId = user.userId;
      item.title = user.userId;

      const avatar = document.createElement('div');
      avatar.className = 'presence-avatar';
      avatar.style.backgroundColor = user.color;
      avatar.textContent = initials;

      const username = document.createElement('span');
      username.className = 'presence-username';
      username.textContent = displayName;

      item.append(avatar, username);

      if (isLocal) {
        const youTag = document.createElement('span');
        youTag.className = 'presence-you-tag';
        youTag.textContent = '(You)';
        item.appendChild(youTag);
      }

      wrapper.appendChild(item);
    }

    if (overflowCount > 0) {
      const remainingUsers = allUsers.slice(maxVisible).map((u) => u.userId).join(', ');
      const overflow = document.createElement('div');
      overflow.className = 'presence-overflow-pill';
      overflow.title = `Other collaborators: ${remainingUsers}`;
      overflow.textContent = `+${overflowCount} More`;
      wrapper.appendChild(overflow);
    }

    this.container.replaceChildren(wrapper);
  }
}
