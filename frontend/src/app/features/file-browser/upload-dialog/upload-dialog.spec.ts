import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadDialog } from './upload-dialog';

describe('UploadDialog', () => {
  let component: UploadDialog;
  let fixture: ComponentFixture<UploadDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
