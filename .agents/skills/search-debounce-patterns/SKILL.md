---
name: search-debounce-patterns
description: Debounced search patterns for Angular 22. Covers signal-based search with debouncing, autocomplete integration, result highlighting, and reactive filtering.
---

# Search Debounce Patterns

This skill outlines how to implement debounced search and autocomplete in Angular 22 using Signals and RxJS interoperability.

## Recommended Approach: RxJS Interop

While you can write a manual debounce using `setTimeout` inside an `effect()`, the recommended approach is leveraging `@angular/core/rxjs-interop` methods like `toObservable` and `toSignal`. This enables powerful RxJS operators (`debounceTime`, `switchMap`) for API calls and cleaner cancellation.

### Implementation Pattern

```typescript
import { Component, signal, inject, computed } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, switchMap, filter, of } from 'rxjs';
import { FileService } from '../../core/services/file.service';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss'
})
export class SearchBarComponent {
  private fileService = inject(FileService);

  // 1. The search query bound to the input
  searchQuery = signal<string>('');

  // 2. Convert to observable and apply RxJS operators
  private searchResults$ = toObservable(this.searchQuery).pipe(
    debounceTime(300),
    distinctUntilChanged(),
    // 3. Minimum query length of 2
    switchMap(query => {
      if (query.trim().length < 2) {
        return of([]);
      }
      return this.fileService.search(query);
    })
  );

  // 4. Convert back to signal for the template
  searchResults = toSignal(this.searchResults$, { initialValue: [] });

  // Example of derived state
  hasResults = computed(() => this.searchResults().length > 0);
  isSearching = computed(() => this.searchQuery().trim().length >= 2 && !this.hasResults());
}
```

## Search Logic and Sorting

If filtering data locally instead of making an API call, you still benefit from `debounceTime` to avoid blocking the main thread on every keystroke when searching large datasets.

When returning results, sort by relevance:
1. Exact match
2. Starts with
3. Contains

```typescript
import { Service } from '@angular/core';

@Service()
export class SearchService {
  
  filterItems(items: DriveItem[], query: string): DriveItem[] {
    const lowerQuery = query.toLowerCase();
    
    return items
      .filter(item => item.name.toLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        
        // Exact match
        if (aName === lowerQuery) return -1;
        if (bName === lowerQuery) return 1;
        
        // Starts with
        const aStarts = aName.startsWith(lowerQuery);
        const bStarts = bName.startsWith(lowerQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        
        return 0; // Fallback to original order or alphabetical
      });
  }
}
```

## MatAutocomplete Integration

Bind the input to `matAutocomplete` and group results or display specific icons based on type.

```html
<mat-form-field appearance="outline" class="search-field">
  <mat-icon matPrefix>search</mat-icon>
  <input type="text"
         matInput
         placeholder="Search files and folders..."
         [ngModel]="searchQuery()"
         (ngModelChange)="searchQuery.set($event)"
         [matAutocomplete]="auto">
         
  @if (searchQuery()) {
    <button matSuffix mat-icon-button aria-label="Clear" (click)="searchQuery.set('')">
      <mat-icon>close</mat-icon>
    </button>
  }
</mat-form-field>

<mat-autocomplete #auto="matAutocomplete" (optionSelected)="onItemSelected($event.option.value)">
  @for (item of searchResults(); track item.id) {
    <mat-option [value]="item">
      <mat-icon>{{ item.type === 'folder' ? 'folder' : 'insert_drive_file' }}</mat-icon>
      <!-- Assuming a custom pipe for highlighting -->
      <span [innerHTML]="item.name | highlightSearch: searchQuery()"></span>
    </mat-option>
  }

  @if (searchQuery().length >= 2 && searchResults().length === 0) {
    <mat-option disabled class="no-results-option">
      No results found for "{{ searchQuery() }}"
    </mat-option>
  }
</mat-autocomplete>
```

## Result Highlighting

To bold the matched substring, use a custom pipe (e.g., `HighlightSearchPipe`).

```typescript
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'highlightSearch',
  standalone: true
})
export class HighlightSearchPipe implements PipeTransform {
  transform(value: string, search: string): string {
    if (!search || !value) {
      return value;
    }
    // Escape regex characters
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearch})`, 'gi');
    return value.replace(regex, '<strong>$1</strong>');
  }
}
```

*Note: Since the output includes HTML `<strong>`, use `[innerHTML]` in the template. If there's a risk of XSS from the item names, ensure `DomSanitizer` is used within the pipe or that names are safely escaped before applying the highlight.*
