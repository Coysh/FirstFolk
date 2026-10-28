import { render } from 'preact';
import { Shell } from './shell';
import { Root } from './ui/Screens';
import './ui/styles.css';

const canvas = document.getElementById('world') as HTMLCanvasElement;
const shell = new Shell(canvas, document.getElementById('overlay')!);
render(<Root shell={shell} />, document.getElementById('ui')!);
shell.start();

// Handy for debugging and automated screenshots.
Object.assign(window, { firstfolk: { shell } });
