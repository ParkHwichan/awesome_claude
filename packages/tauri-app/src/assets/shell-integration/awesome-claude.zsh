#!/bin/zsh
# Awesome Claude Terminal Integration for Zsh
# Add this to your ~/.zshrc: source "path/to/awesome-claude.zsh"

# Only run in interactive shells
[[ -o interactive ]] || return

# OSC 133 escape sequences
__ac_osc133_a() { print -n '\e]133;A\e\\' }  # Prompt start
__ac_osc133_b() { print -n '\e]133;B\e\\' }  # Command start
__ac_osc133_c() { print -n '\e]133;C\e\\' }  # Execution start
__ac_osc133_d() { print -n "\e]133;D;$1\e\\" }  # Command finished

# Track last exit code
typeset -g __ac_last_exit_code=0

# Called before prompt is displayed
__ac_precmd() {
    __ac_last_exit_code=$?

    # Send command finished (if not first prompt)
    if [[ -n "$__ac_command_started" ]]; then
        __ac_osc133_d "$__ac_last_exit_code"
        unset __ac_command_started
    fi

    # Send prompt start
    __ac_osc133_a
}

# Called before command execution
__ac_preexec() {
    __ac_command_started=1
    __ac_osc133_c
}

# Register hooks
autoload -Uz add-zsh-hook
add-zsh-hook precmd __ac_precmd
add-zsh-hook preexec __ac_preexec

# Set prompt with OSC 133;B marker at the end
# Customize your prompt here
setopt PROMPT_SUBST
PROMPT='%F{green}%n@%m%f:%F{blue}%~%f%# %{$(__ac_osc133_b)%}'

print "Awesome Claude shell integration loaded"
