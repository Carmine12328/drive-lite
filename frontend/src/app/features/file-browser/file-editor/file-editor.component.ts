import {
  Component,
  ElementRef,
  input,
  output,
  viewChild,
  OnInit,
  OnDestroy,
  effect,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

// CodeMirror 6 imports
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

/**
 * In-browser code and markdown editor powered by modular CodeMirror 6.
 * Features syntax highlighting, line numbers, dark theme support,
 * keyboard shortcuts (Ctrl+S to save), and markdown preview mode.
 */
@Component({
  selector: 'app-file-editor',
  templateUrl: './file-editor.component.html',
  styleUrl: './file-editor.component.scss',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatButtonToggleModule,
  ],
})
export class FileEditorComponent implements OnInit, OnDestroy {
  /** Target container for mounting CodeMirror */
  private readonly editorHost = viewChild<ElementRef<HTMLDivElement>>('editorHost');

  /** Initial or current text content */
  content = input<string>('');

  /** Current file name (used for language detection) */
  fileName = input<string>('');

  /** Whether the editor is in read-only mode */
  readOnly = input<boolean>(false);

  /** Emits when document text changes in editor */
  contentChange = output<string>();

  /** Emits when save is requested (Ctrl+S or Save action) */
  save = output<string>();

  /** Active view mode for Markdown files: 'code' | 'preview' | 'split' */
  readonly editorMode = signal<'code' | 'preview' | 'split'>('code');

  /** Whether this file is a Markdown document */
  readonly isMarkdown = computed(() => {
    const name = this.fileName().toLowerCase();
    return name.endsWith('.md') || name.endsWith('.markdown');
  });

  /** CodeMirror editor view instance */
  private editorView?: EditorView;

  /** Internal cached content string */
  private currentText = '';

  constructor() {
    // Re-initialize or update text when input content changes
    effect(() => {
      const newContent = this.content();
      if (this.editorView && newContent !== this.currentText) {
        this.currentText = newContent;
        this.editorView.dispatch({
          changes: { from: 0, to: this.editorView.state.doc.length, insert: newContent }
        });
      }
    });
  }

  ngOnInit(): void {
    // Defer initialization to next tick to ensure DOM is attached
    setTimeout(() => {
      this.initEditor();
    }, 0);
  }

  ngOnDestroy(): void {
    if (this.editorView) {
      this.editorView.destroy();
    }
  }

  /**
   * Initializes and mounts the CodeMirror 6 instance.
   */
  private initEditor(): void {
    const hostEl = this.editorHost()?.nativeElement;
    if (!hostEl || this.editorView) return;

    this.currentText = this.content();

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      foldGutter(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      oneDark,
      this.getLanguageExtension(this.fileName()),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        {
          key: 'Mod-s',
          run: () => {
            this.onSave();
            return true;
          }
        }
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.currentText = update.state.doc.toString();
          this.contentChange.emit(this.currentText);
        }
      }),
      EditorState.readOnly.of(this.readOnly())
    ];

    const state = EditorState.create({
      doc: this.currentText,
      extensions
    });

    this.editorView = new EditorView({
      state,
      parent: hostEl
    });
  }

  /**
   * Resolves appropriate CodeMirror language extension based on file extension.
   */
  private getLanguageExtension(fileName: string): Extension {
    const lower = fileName.toLowerCase();
    const ext = lower.split('.').pop() || '';

    switch (ext) {
      case 'js':
      case 'mjs':
      case 'cjs':
        return javascript();
      case 'ts':
      case 'tsx':
      case 'jsx':
        return javascript({ typescript: true, jsx: ext.endsWith('x') });
      case 'json':
        return json();
      case 'md':
      case 'markdown':
        return markdown();
      case 'html':
      case 'htm':
        return html();
      case 'css':
      case 'scss':
      case 'sass':
        return css();
      case 'py':
        return python();
      default:
        return [];
    }
  }

  /**
   * Triggers the save output event with the latest document content.
   */
  onSave(): void {
    const text = this.editorView ? this.editorView.state.doc.toString() : this.currentText;
    this.save.emit(text);
  }

  /**
   * Returns current editor text for preview rendering.
   */
  getLatestContent(): string {
    return this.editorView ? this.editorView.state.doc.toString() : this.currentText;
  }
}
