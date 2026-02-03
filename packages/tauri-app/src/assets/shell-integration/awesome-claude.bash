#!/bin/bash
# Awesome Claude Terminal Integration for Bash
# Add this to your ~/.bashrc: source "path/to/awesome-claude.bash"

# Only run in interactive shells
[[ $- != *i* ]] && return

# OSC 133 escape sequences
__ac_osc133_a() { printf '\e]133;A\e\\'; }  # Prompt start
__ac_osc133_b() { printf '\e]133;B\e\\'; }  # Command start
__ac_osc133_c() { printf '\e]133;C\e\\'; }  # Execution start
__ac_osc133_d() { printf '\e]133;D;%s\e\\' "$1"; }  # Command finished

# Store original PROMPT_COMMAND
__ac_original_prompt_command="$PROMPT_COMMAND"

# Track command execution
__ac_preexec_called=0
__ac_last_exit_code=0

# Called before command execution
__ac_preexec() {
    if [[ $__ac_preexec_called -eq 0 ]]; then
        __ac_preexec_called=1
        __ac_osc133_c
    fi
}

# Called after command execution (in PROMPT_COMMAND)
__ac_precmd() {
    __ac_last_exit_code=$?

    # Send command finished if we ran a command
    if [[ $__ac_preexec_called -eq 1 ]]; then
        __ac_osc133_d "$__ac_last_exit_code"
        __ac_preexec_called=0
    fi

    # Run original PROMPT_COMMAND
    if [[ -n "$__ac_original_prompt_command" ]]; then
        eval "$__ac_original_prompt_command"
    fi
}

# Set up PROMPT_COMMAND
PROMPT_COMMAND='__ac_precmd'

# Set up preexec using DEBUG trap
trap '__ac_preexec' DEBUG

# PS1 with OSC 133 markers embedded
# \[ and \] are non-printing character wrappers for PS1
# OSC 133;A = prompt start, OSC 133;B = command start
PS1='\[\e]133;A\e\\\]\[\e[32m\]\u@\h\[\e[0m\]:\[\e[34m\]\w\[\e[0m\]\$ \[\e]133;B\e\\\]'
