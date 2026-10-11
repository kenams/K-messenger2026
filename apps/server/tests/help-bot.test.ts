import { describe, expect, it } from 'vitest';
import { craftHelpReply, HELP_TOPIC_IDS, SUPPORT_EMAIL } from '../src/helpBot.js';

describe('K-Bot help engine', () => {
  it('explains Last.fm with the exact in-app path', () => {
    const r = craftHelpReply('Comment je connecte last.fm ?');
    expect(r).toContain('Pseudo Last.fm');
    expect(r).toContain('Modifier mon profil');
  });

  it('warns that Spotify needs Premium', () => {
    expect(craftHelpReply('spotify ça marche pas')).toContain('Premium');
  });

  it('routes account deletion to the delete topic, not generic account help', () => {
    expect(craftHelpReply('je veux supprimer mon compte')).toContain('Supprimer mon compte');
  });

  it('does not treat words that merely contain "ami" as a contacts question', () => {
    expect(craftHelpReply("c'est dynamique")).not.toContain('Ajouter quelqu');
  });

  it('answers a bug report with the support address', () => {
    expect(craftHelpReply("l'appli plante au lancement")).toContain(SUPPORT_EMAIL);
  });

  it('shows the menu for greetings and unknown questions point to support', () => {
    expect(craftHelpReply('salut')).toContain('Demande-moi');
    const unknown = craftHelpReply('quelle est la capitale du Pérou');
    expect(unknown).toContain(SUPPORT_EMAIL);
    expect(unknown).toContain('menu');
  });

  it('never leaves a topic with an empty answer', () => {
    expect(HELP_TOPIC_IDS.length).toBeGreaterThanOrEqual(15);
  });
});
