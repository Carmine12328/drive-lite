import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LandingComponent } from './landing.component';

/**
 * Unit tests for LandingComponent.
 */
describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('should create and initialize with default browser tab', () => {
    expect(component).toBeTruthy();
    expect(component.activeFeature()).toBe('browser');
    expect(component.activePreviewTab()).toBe('code');
  });

  it('should switch active showcase features', () => {
    component.selectFeature('upload');
    expect(component.activeFeature()).toBe('upload');

    component.selectFeature('analytics');
    expect(component.activeFeature()).toBe('analytics');
  });

  it('should switch preview sub-tabs', () => {
    component.selectPreviewTab('pdf');
    expect(component.activePreviewTab()).toBe('pdf');

    component.selectPreviewTab('image');
    expect(component.activePreviewTab()).toBe('image');
  });

  it('should toggle theme between dark and light', () => {
    const initial = component.isDarkTheme();
    component.toggleTheme();
    expect(component.isDarkTheme()).toBe(!initial);
  });

  it('should navigate to register page', () => {
    const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.navigateToRegister();
    expect(spy).toHaveBeenCalledWith(['/auth/register']);
  });

  it('should navigate to login page', () => {
    const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.navigateToLogin();
    expect(spy).toHaveBeenCalledWith(['/auth/login']);
  });
});
