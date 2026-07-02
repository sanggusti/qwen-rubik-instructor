export interface Contributor {
  name: string;
  role: string;
  avatarUrl: string;
  githubUrl: string;
}

// Fill in real contributors — avatarUrl follows GitHub's
// https://github.com/<user>.png convention.
export const contributors: Contributor[] = [
  {
    name: 'sanggusti',
    role: 'Maintainer',
    avatarUrl: 'https://github.com/sanggusti.png',
    githubUrl: 'https://github.com/sanggusti'
  },
  {
    name: 'suryatresna',
    role: 'Contributor',
    avatarUrl: 'https://github.com/suryatresna.png',
    githubUrl: 'https://github.com/suryatresna'
  }
];
